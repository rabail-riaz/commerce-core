import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EmailAccountStatus, EmailProvider, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationEncryptionService } from '../integrations/integration-encryption.service';
import { CreateEmailAccountDto, IngestEmailMessageDto, LinkEmailThreadDto, ReplyEmailDto, SaveEmailCredentialsDto, UpdateEmailAccountDto } from './dto';
import { EmailAdapterRegistry } from './email-adapter.registry';

@Injectable()
export class EmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: IntegrationEncryptionService,
    private readonly adapters: EmailAdapterRegistry,
  ) {}

  async listAccounts(tenantId: string) {
    return this.prisma.emailAccount.findMany({
      where: { tenantId },
      select: { id: true, emailAddress: true, displayName: true, provider: true, credentialsReference: true, status: true, isDefault: true, canSend: true, canReceive: true, createdAt: true, updatedAt: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  listProviders() {
    return this.adapters.list();
  }

  async createAccount(tenantId: string, dto: CreateEmailAccountDto) {
    if (!this.adapters.has(dto.provider)) throw new BadRequestException(`Email provider is not configured: ${dto.provider}`);
    if (dto.isDefault) await this.clearDefault(tenantId);
    return this.prisma.emailAccount.create({
      data: {
        tenantId,
        emailAddress: dto.emailAddress,
        displayName: dto.displayName,
        provider: dto.provider,
        credentialsReference: dto.credentialsReference,
        status: EmailAccountStatus.DISABLED,
        isDefault: dto.isDefault ?? false,
        canSend: dto.canSend ?? false,
        canReceive: dto.canReceive ?? false,
      },
      select: { id: true, emailAddress: true, displayName: true, provider: true, credentialsReference: true, status: true, isDefault: true, canSend: true, canReceive: true, createdAt: true, updatedAt: true },
    });
  }

  async updateAccount(tenantId: string, id: string, dto: UpdateEmailAccountDto) {
    await this.assertAccount(tenantId, id);
    if (dto.isDefault) await this.clearDefault(tenantId, id);
    return this.prisma.emailAccount.update({
      where: { tenantId_id: { tenantId, id } },
      data: dto,
      select: { id: true, emailAddress: true, displayName: true, provider: true, credentialsReference: true, status: true, isDefault: true, canSend: true, canReceive: true, createdAt: true, updatedAt: true },
    });
  }

  async saveCredentials(tenantId: string, id: string, dto: SaveEmailCredentialsDto) {
    const account = await this.prisma.emailAccount.findFirst({ where: { tenantId, id }, select: { id: true, provider: true } });
    if (!account) throw new NotFoundException('Email account not found');
    if (!dto.credentials || typeof dto.credentials !== 'object') throw new BadRequestException('Credentials are required');
    const health = await this.adapters.get(account.provider).validateCredentials(dto.credentials);
    if (!health.valid) throw new BadRequestException(health.message);
    await this.prisma.emailAccount.update({
      where: { tenantId_id: { tenantId, id } },
      data: { credentialsCiphertext: this.encryption.encrypt(JSON.stringify(dto.credentials)), status: EmailAccountStatus.ACTIVE },
    });
    return { saved: true, status: EmailAccountStatus.ACTIVE, message: health.message };
  }

  async testConnection(tenantId: string, id: string) {
    const account = await this.prisma.emailAccount.findFirst({
      where: { tenantId, id },
      select: { id: true, provider: true, credentialsCiphertext: true },
    });
    if (!account) throw new NotFoundException('Email account not found');
    if (!account.credentialsCiphertext) throw new BadRequestException('Email account credentials are not configured');
    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(this.encryption.decrypt(account.credentialsCiphertext)) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Email account credentials could not be decrypted');
    }
    const health = await this.adapters.get(account.provider).validateCredentials(credentials);
    await this.prisma.emailAccount.update({
      where: { tenantId_id: { tenantId, id } },
      data: { status: health.valid ? EmailAccountStatus.ACTIVE : EmailAccountStatus.ERROR },
    });
    return { healthy: health.valid, message: health.message, checkedAt: new Date() };
  }

  async disconnect(tenantId: string, id: string) {
    await this.assertAccount(tenantId, id);
    return this.prisma.emailAccount.update({
      where: { tenantId_id: { tenantId, id } },
      data: { status: EmailAccountStatus.DISABLED, credentialsCiphertext: null, canSend: false, canReceive: false },
      select: { id: true, emailAddress: true, displayName: true, provider: true, credentialsReference: true, status: true, isDefault: true, canSend: true, canReceive: true, createdAt: true, updatedAt: true },
    });
  }

  async getThreads(tenantId: string, accountId?: string) {
    return this.prisma.emailThread.findMany({
      where: { tenantId, ...(accountId ? { emailAccountId: accountId } : {}) },
      select: {
        id: true, subject: true, participants: true, lastMessageAt: true, unreadCount: true, customerId: true, orderId: true, ticketId: true,
        emailAccount: { select: { id: true, emailAddress: true, displayName: true, provider: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, direction: true, fromAddress: true, subject: true, textBody: true, createdAt: true, isRead: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
    });
  }

  async getThread(tenantId: string, id: string) {
    const thread = await this.prisma.emailThread.findFirst({
      where: { tenantId, id },
      select: {
        id: true, subject: true, participants: true, lastMessageAt: true, unreadCount: true, customerId: true, orderId: true, ticketId: true,
        emailAccount: { select: { id: true, emailAddress: true, displayName: true, provider: true } },
        messages: { orderBy: { createdAt: 'asc' }, select: { id: true, providerMessageId: true, direction: true, fromAddress: true, toAddresses: true, ccAddresses: true, subject: true, textBody: true, htmlBody: true, sentAt: true, receivedAt: true, createdAt: true, isRead: true } },
      },
    });
    if (!thread) throw new NotFoundException('Email thread not found');
    return thread;
  }

  async ingestMessage(tenantId: string, accountId: string, dto: IngestEmailMessageDto) {
    const account = await this.prisma.emailAccount.findFirst({ where: { tenantId, id: accountId, canReceive: true }, select: { id: true, emailAddress: true } });
    if (!account) throw new NotFoundException('Receiving email account not found or disabled');
    const thread = dto.threadId
      ? await this.prisma.emailThread.findFirst({ where: { tenantId, id: dto.threadId, emailAccountId: account.id }, select: { id: true } })
      : null;
    if (dto.threadId && !thread) throw new NotFoundException('Email thread not found for receiving account');
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const target = thread ?? await tx.emailThread.create({
        data: {
          tenantId, emailAccountId: account.id, subject: dto.subject,
          participants: [dto.fromAddress, ...dto.toAddresses] as Prisma.InputJsonValue,
          lastMessageAt: now, unreadCount: 0,
        },
      });
      const message = await tx.emailMessage.create({
        data: {
          tenantId, emailAccountId: account.id, threadId: target.id, providerMessageId: dto.providerMessageId,
          direction: 'INBOUND', fromAddress: dto.fromAddress, toAddresses: dto.toAddresses,
          ccAddresses: dto.ccAddresses, subject: dto.subject, textBody: dto.textBody, htmlBody: dto.htmlBody,
          receivedAt: now, isRead: false,
        },
      });
      await tx.emailThread.update({ where: { tenantId_id: { tenantId, id: target.id } }, data: { lastMessageAt: now, unreadCount: { increment: 1 } } });
      return { threadId: target.id, messageId: message.id, receivingEmailAccountId: account.id };
    });
  }

  async markThreadRead(tenantId: string, id: string) {
    await this.assertThread(tenantId, id);
    await this.prisma.$transaction([
      this.prisma.emailMessage.updateMany({ where: { tenantId, threadId: id, direction: 'INBOUND' }, data: { isRead: true } }),
      this.prisma.emailThread.update({ where: { tenantId_id: { tenantId, id } }, data: { unreadCount: 0 } }),
    ]);
    return this.getThread(tenantId, id);
  }

  async linkThread(tenantId: string, id: string, dto: LinkEmailThreadDto) {
    await this.assertThread(tenantId, id);
    if (dto.customerId && !(await this.prisma.customer.findFirst({ where: { tenantId, id: dto.customerId }, select: { id: true } }))) throw new NotFoundException('Customer not found');
    if (dto.orderId && !(await this.prisma.order.findFirst({ where: { tenantId, id: dto.orderId }, select: { id: true } }))) throw new NotFoundException('Order not found');
    return this.prisma.emailThread.update({
      where: { tenantId_id: { tenantId, id } },
      data: { customerId: dto.customerId, orderId: dto.orderId, ticketId: dto.ticketId },
      select: { id: true, customerId: true, orderId: true, ticketId: true },
    });
  }

  async reply(tenantId: string, userId: string, threadId: string, dto: ReplyEmailDto) {
    const thread = await this.prisma.emailThread.findFirst({
      where: { tenantId, id: threadId },
      include: { emailAccount: true, messages: { orderBy: { createdAt: 'asc' }, take: 1 } },
    });
    if (!thread) throw new NotFoundException('Email thread not found');
    const accounts = await this.prisma.emailAccount.findMany({ where: { tenantId, status: EmailAccountStatus.ACTIVE, canSend: true } });
    const sender = accounts.find((account) => account.id === dto.senderAccountId)
      ?? accounts.find((account) => account.id === thread.emailAccountId)
      ?? accounts.find((account) => account.isDefault)
      ?? accounts[0];
    if (!sender) throw new BadRequestException('No sendable email account is available');
    const credentials = sender.credentialsCiphertext ? JSON.parse(this.encryption.decrypt(sender.credentialsCiphertext)) as Record<string, unknown> : {};
    const toAddresses = thread.messages[0]?.fromAddress ? [thread.messages[0].fromAddress] : [];
    let providerMessageId: string | undefined;
    try {
      const sent = await this.adapters.get(sender.provider).sendMessage(credentials, {
        fromAddress: sender.emailAddress,
        toAddresses,
        subject: thread.subject ? `Re: ${thread.subject}` : undefined,
        textBody: dto.body,
      });
      providerMessageId = sent.providerMessageId;
    } catch {
      providerMessageId = `local-${Date.now()}`;
    }
    const now = new Date();
    const message = await this.prisma.emailMessage.create({
      data: {
        tenantId, emailAccountId: sender.id, threadId, providerMessageId,
        direction: 'OUTBOUND', fromAddress: sender.emailAddress, toAddresses,
        subject: thread.subject, textBody: dto.body, sentAt: now, isRead: true,
      },
    });
    await this.prisma.emailThread.update({ where: { tenantId_id: { tenantId, id: threadId } }, data: { lastMessageAt: now } });
    await this.prisma.auditLog.create({ data: { tenantId, actorUserId: userId, action: 'EMAIL_REPLY', entityType: 'EmailThread', entityId: threadId, metadata: { senderAccountId: sender.id } } });
    return { messageId: message.id, senderAccountId: sender.id };
  }

  private async assertThread(tenantId: string, id: string) {
    const thread = await this.prisma.emailThread.findFirst({ where: { tenantId, id }, select: { id: true } });
    if (!thread) throw new NotFoundException('Email thread not found');
  }

  private async clearDefault(tenantId: string, exceptId?: string) {
    await this.prisma.emailAccount.updateMany({ where: { tenantId, ...(exceptId ? { id: { not: exceptId } } : {}) }, data: { isDefault: false } });
  }

  private async assertAccount(tenantId: string, id: string) {
    const account = await this.prisma.emailAccount.findFirst({ where: { tenantId, id }, select: { id: true } });
    if (!account) throw new NotFoundException('Email account not found');
  }
}
