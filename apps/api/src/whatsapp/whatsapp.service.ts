import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationEncryptionService } from '../integrations/integration-encryption.service';
import { AuditService } from '../common/audit.service';
import { WhatsAppAdapterRegistry } from './whatsapp-adapter.registry';
import { WhatsAppCredentials } from './whatsapp-adapter';

export class SaveWhatsAppAccountDto {
  @IsString() @MinLength(2) displayName!: string;
  @IsString() phoneNumberId!: string;
  @IsOptional() @IsString() businessAccountId?: string;
  @IsOptional() @IsString() accessToken?: string;
  @IsOptional() @IsString() verifyToken?: string;
}

export class WhatsAppReplyDto {
  @IsString() @MinLength(1) body!: string;
}

@Injectable()
export class WhatsAppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: IntegrationEncryptionService,
    private readonly audit: AuditService,
    private readonly adapters: WhatsAppAdapterRegistry,
  ) {}

  listAccounts(tenantId: string) {
    return this.prisma.whatsAppAccount.findMany({
      where: { tenantId },
      select: { id: true, displayName: true, phoneNumberId: true, businessAccountId: true, status: true, createdAt: true },
    });
  }

  async saveAccount(tenantId: string, dto: SaveWhatsAppAccountDto) {
    const ciphertext = dto.accessToken || dto.verifyToken
      ? this.encryption.encrypt(JSON.stringify({ accessToken: dto.accessToken, verifyToken: dto.verifyToken }))
      : undefined;
    const existing = await this.prisma.whatsAppAccount.findFirst({ where: { tenantId, phoneNumberId: dto.phoneNumberId } });
    const data = { displayName: dto.displayName, businessAccountId: dto.businessAccountId, credentialsCiphertext: ciphertext, status: ciphertext ? 'ACTIVE' as const : 'DISABLED' as const };
    return existing
      ? this.prisma.whatsAppAccount.update({ where: { tenantId_id: { tenantId, id: existing.id } }, data, select: { id: true, displayName: true, phoneNumberId: true, status: true } })
      : this.prisma.whatsAppAccount.create({ data: { tenantId, phoneNumberId: dto.phoneNumberId, ...data }, select: { id: true, displayName: true, phoneNumberId: true, status: true } });
  }

  listProviders() {
    return this.adapters.list();
  }

  listConversations(tenantId: string, customerId?: string, orderId?: string) {
    return this.prisma.whatsAppConversation.findMany({
      where: { tenantId, ...(customerId ? { customerId } : {}), ...(orderId ? { orderId } : {}) },
      include: { account: { select: { id: true, displayName: true, phoneNumberId: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { lastMessageAt: 'desc' },
    });
  }

  async getConversation(tenantId: string, id: string) {
    const conversation = await this.prisma.whatsAppConversation.findFirst({
      where: { tenantId, id },
      include: { account: { select: { id: true, displayName: true, phoneNumberId: true, status: true } }, messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) throw new NotFoundException('WhatsApp conversation not found');
    return conversation;
  }

  async reply(tenantId: string, userId: string, id: string, dto: WhatsAppReplyDto) {
    const conversation = await this.prisma.whatsAppConversation.findFirst({ where: { tenantId, id }, include: { account: true } });
    if (!conversation) throw new NotFoundException('WhatsApp conversation not found');
    if (conversation.account.status !== 'ACTIVE') throw new BadRequestException('WhatsApp account is not healthy');
    const credentials = this.decryptCredentials(conversation.account.credentialsCiphertext);
    let sent: { providerMessageId: string; status: string };
    try {
      sent = await this.adapters.get('META').sendMessage({
        accessToken: credentials.accessToken,
        phoneNumberId: conversation.account.phoneNumberId,
        businessAccountId: conversation.account.businessAccountId ?? undefined,
      }, { to: conversation.customerPhone, body: dto.body });
    } catch {
      await this.prisma.whatsAppAccount.update({ where: { tenantId_id: { tenantId, id: conversation.accountId } }, data: { status: 'ERROR' } });
      throw new BadRequestException('WhatsApp provider rejected the message');
    }
    const now = new Date();
    const message = await this.prisma.whatsAppMessage.create({
      data: { tenantId, accountId: conversation.accountId, conversationId: id, direction: 'OUTBOUND', body: dto.body, status: sent.status, providerMessageId: sent.providerMessageId },
    });
    await this.prisma.whatsAppConversation.update({ where: { tenantId_id: { tenantId, id } }, data: { lastMessageAt: now, unreadCount: 0 } });
    await this.audit.record(tenantId, userId, 'WHATSAPP_REPLY', 'WhatsAppConversation', id);
    return message;
  }

  async verifyWebhook(mode: string, token: string, challenge: string) {
    if (mode === 'subscribe' && token && challenge) {
      const accounts = await this.prisma.whatsAppAccount.findMany({ where: { status: 'ACTIVE', credentialsCiphertext: { not: null } }, select: { credentialsCiphertext: true } });
      if (accounts.some((account) => this.decryptCredentials(account.credentialsCiphertext).verifyToken === token)) return challenge;
    }
    throw new UnauthorizedException('Invalid WhatsApp webhook verification');
  }

  async ingest(payload: { phoneNumberId?: string; from?: string; body?: string; providerMessageId?: string; mediaType?: string; mediaReference?: string; status?: string }) {
    if (!payload.phoneNumberId || !payload.providerMessageId) throw new BadRequestException('Invalid WhatsApp payload');
    const account = await this.prisma.whatsAppAccount.findFirst({ where: { phoneNumberId: payload.phoneNumberId } });
    if (!account) throw new NotFoundException('WhatsApp account not found');
    if (payload.status) {
      return this.prisma.whatsAppMessage.updateMany({ where: { tenantId: account.tenantId, accountId: account.id, providerMessageId: payload.providerMessageId }, data: { status: payload.status } });
    }
    if (!payload.from || (!payload.body && !payload.mediaReference)) throw new BadRequestException('Invalid WhatsApp message payload');
    const existing = await this.prisma.whatsAppMessage.findFirst({ where: { tenantId: account.tenantId, accountId: account.id, providerMessageId: payload.providerMessageId } });
    if (existing) return { duplicate: true, messageId: existing.id };
    const customer = await this.prisma.customer.findFirst({ where: { tenantId: account.tenantId, phone: payload.from } });
    const order = customer ? await this.prisma.order.findFirst({ where: { tenantId: account.tenantId, customerId: customer.id }, orderBy: { createdAt: 'desc' }, select: { id: true } }) : null;
    const now = new Date();
    const conversation = await this.prisma.whatsAppConversation.upsert({
      where: { tenantId_accountId_customerPhone: { tenantId: account.tenantId, accountId: account.id, customerPhone: payload.from } },
      update: { lastMessageAt: now, unreadCount: { increment: 1 }, customerId: customer?.id, orderId: order?.id },
      create: { tenantId: account.tenantId, accountId: account.id, customerPhone: payload.from, customerId: customer?.id, orderId: order?.id, lastMessageAt: now, unreadCount: 1 },
    });
    const message = await this.prisma.whatsAppMessage.create({
      data: { tenantId: account.tenantId, accountId: account.id, conversationId: conversation.id, providerMessageId: payload.providerMessageId, direction: 'INBOUND', body: payload.body ?? '', mediaType: payload.mediaType, mediaReference: payload.mediaReference, status: 'RECEIVED' },
    });
    return { duplicate: false, conversationId: conversation.id, messageId: message.id };
  }

  async markRead(tenantId: string, id: string) {
    const conversation = await this.prisma.whatsAppConversation.findFirst({ where: { tenantId, id }, select: { id: true } });
    if (!conversation) throw new NotFoundException('WhatsApp conversation not found');
    return this.prisma.whatsAppConversation.update({ where: { tenantId_id: { tenantId, id } }, data: { unreadCount: 0 } });
  }

  private decryptCredentials(ciphertext: string | null): WhatsAppCredentials & { verifyToken?: string } {
    if (!ciphertext) throw new BadRequestException('WhatsApp credentials are not configured');
    try {
      return JSON.parse(this.encryption.decrypt(ciphertext)) as WhatsAppCredentials & { verifyToken?: string };
    } catch {
      throw new BadRequestException('WhatsApp credentials could not be decrypted');
    }
  }
}
