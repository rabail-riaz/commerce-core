import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  async list(tenantId: string, channel?: string, customerId?: string, orderId?: string) {
    const [email, whatsapp] = await Promise.all([
      channel === 'WHATSAPP' ? [] : this.prisma.emailThread.findMany({
        where: { tenantId, ...(customerId ? { customerId } : {}), ...(orderId ? { orderId } : {}) },
        include: { emailAccount: { select: { emailAddress: true, displayName: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
        orderBy: { lastMessageAt: 'desc' },
      }),
      channel === 'EMAIL' ? [] : this.whatsapp.listConversations(tenantId, customerId, orderId),
    ]);
    return [
      ...email.map((thread) => ({ id: thread.id, channel: 'EMAIL' as const, title: thread.subject || '(No subject)', preview: thread.messages[0]?.textBody ?? '', unreadCount: thread.unreadCount, lastMessageAt: thread.lastMessageAt, customerId: thread.customerId, orderId: thread.orderId })),
      ...whatsapp.map((conversation) => ({ id: conversation.id, channel: 'WHATSAPP' as const, title: conversation.customerPhone, preview: conversation.messages[0]?.body ?? '', unreadCount: conversation.unreadCount, lastMessageAt: conversation.lastMessageAt, customerId: conversation.customerId, orderId: conversation.orderId })),
    ].sort((a, b) => new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime());
  }

  async get(tenantId: string, channel: string, id: string) {
    if (channel === 'WHATSAPP') return { channel, conversation: await this.whatsapp.getConversation(tenantId, id) };
    return { channel: 'EMAIL', conversation: await this.email.getThread(tenantId, id) };
  }

  async markRead(tenantId: string, channel: string, id: string) {
    if (channel === 'WHATSAPP') return this.whatsapp.markRead(tenantId, id);
    return this.email.markThreadRead(tenantId, id);
  }

  async reply(tenantId: string, userId: string, channel: string, id: string, body: { body: string; senderAccountId?: string }) {
    if (channel === 'WHATSAPP') return this.whatsapp.reply(tenantId, userId, id, { body: body.body });
    return this.email.reply(tenantId, userId, id, { body: body.body, senderAccountId: body.senderAccountId });
  }
}
