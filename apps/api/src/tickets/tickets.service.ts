import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { CreateTicketDto, TicketMessageDto, TicketQueryDto, UpdateTicketDto } from './dto';

@Injectable()
export class TicketsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(tenantId: string, query: TicketQueryDto) {
    const where: Prisma.SupportTicketWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.search ? { subject: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.supportTicket.findMany({
        where,
        include: { customer: { select: { id: true, email: true, firstName: true, lastName: true } }, order: { select: { id: true, externalOrderId: true } }, assignee: { select: { id: true, email: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return { items, page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) };
  }

  async getById(tenantId: string, id: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { tenantId, id },
      include: {
        customer: { select: { id: true, email: true, firstName: true, lastName: true } },
        order: { select: { id: true, externalOrderId: true, status: true } },
        assignee: { select: { id: true, email: true, firstName: true, lastName: true } },
        messages: { orderBy: { createdAt: 'asc' }, include: { author: { select: { id: true, email: true, firstName: true, lastName: true } } } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async create(tenantId: string, userId: string, dto: CreateTicketDto) {
    if (dto.customerId && !(await this.prisma.customer.findFirst({ where: { tenantId, id: dto.customerId }, select: { id: true } }))) throw new NotFoundException('Customer not found');
    if (dto.orderId && !(await this.prisma.order.findFirst({ where: { tenantId, id: dto.orderId }, select: { id: true } }))) throw new NotFoundException('Order not found');
    if (dto.emailThreadId && !(await this.prisma.emailThread.findFirst({ where: { tenantId, id: dto.emailThreadId }, select: { id: true } }))) throw new NotFoundException('Email thread not found');
    if (dto.whatsappConversationId && !(await this.prisma.whatsAppConversation.findFirst({ where: { tenantId, id: dto.whatsappConversationId }, select: { id: true } }))) throw new NotFoundException('WhatsApp conversation not found');
    const ticket = await this.prisma.supportTicket.create({
      data: {
        tenantId,
        subject: dto.subject,
        customerId: dto.customerId,
        orderId: dto.orderId,
        priority: dto.priority,
        emailThreadId: dto.emailThreadId,
        whatsappConversationId: dto.whatsappConversationId,
      },
    });
    if (dto.body) {
      await this.prisma.ticketMessage.create({ data: { tenantId, ticketId: ticket.id, authorId: userId, body: dto.body } });
    }
    await this.audit.record(tenantId, userId, 'TICKET_CREATED', 'SupportTicket', ticket.id);
    return this.getById(tenantId, ticket.id);
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateTicketDto) {
    await this.assertTicket(tenantId, id);
    if (dto.emailThreadId && !(await this.prisma.emailThread.findFirst({ where: { tenantId, id: dto.emailThreadId }, select: { id: true } }))) throw new NotFoundException('Email thread not found');
    if (dto.whatsappConversationId && !(await this.prisma.whatsAppConversation.findFirst({ where: { tenantId, id: dto.whatsappConversationId }, select: { id: true } }))) throw new NotFoundException('WhatsApp conversation not found');
    const ticket = await this.prisma.supportTicket.update({
      where: { tenantId_id: { tenantId, id } },
      data: dto,
    });
    await this.audit.record(tenantId, userId, 'TICKET_UPDATED', 'SupportTicket', id, undefined, dto as never);
    return ticket;
  }

  async addMessage(tenantId: string, userId: string, id: string, dto: TicketMessageDto) {
    await this.assertTicket(tenantId, id);
    const message = await this.prisma.ticketMessage.create({ data: { tenantId, ticketId: id, authorId: userId, body: dto.body } });
    await this.audit.record(tenantId, userId, 'TICKET_MESSAGE_ADDED', 'SupportTicket', id);
    return message;
  }

  private async assertTicket(tenantId: string, id: string) {
    const ticket = await this.prisma.supportTicket.findFirst({ where: { tenantId, id }, select: { id: true } });
    if (!ticket) throw new NotFoundException('Ticket not found');
  }
}
