import { EmailAccountStatus, EmailProvider } from '@prisma/client';
import { EmailService } from './email.service';

describe('EmailService', () => {
  const prisma = {
    emailAccount: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    emailThread: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    emailMessage: { updateMany: jest.fn() },
    customer: { findFirst: jest.fn() },
    order: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const encryption = { encrypt: jest.fn().mockReturnValue('encrypted-value') };
  const adapter = { validateCredentials: jest.fn().mockResolvedValue({ valid: true, message: 'Credentials validated' }) };
  const adapters = { get: jest.fn().mockReturnValue(adapter), has: jest.fn().mockReturnValue(true), list: jest.fn().mockReturnValue([EmailProvider.SMTP]) };
  const service = new EmailService(prisma as never, encryption as never, adapters as never);

  beforeEach(() => jest.clearAllMocks());

  it('creates a tenant-scoped account without returning secrets', async () => {
    prisma.emailAccount.create.mockResolvedValue({
      id: 'account-1',
      emailAddress: 'support@example.com',
      provider: EmailProvider.GMAIL,
      status: EmailAccountStatus.DISABLED,
      isDefault: true,
      canSend: true,
      canReceive: true,
    });

    const result = await service.createAccount('tenant-1', {
      emailAddress: 'support@example.com',
      provider: EmailProvider.GMAIL,
      isDefault: true,
      canSend: true,
      canReceive: true,
    });

    expect(prisma.emailAccount.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1' } }));
    expect(result).not.toHaveProperty('credentialsCiphertext');
  });

  it('validates and encrypts credentials before activating an account', async () => {
    prisma.emailAccount.findFirst.mockResolvedValue({ id: 'account-1', provider: EmailProvider.SMTP });
    prisma.emailAccount.update.mockResolvedValue({});

    const result = await service.saveCredentials('tenant-1', 'account-1', { credentials: { password: 'secret' } });

    expect(adapter.validateCredentials).toHaveBeenCalledWith({ password: 'secret' });
    expect(encryption.encrypt).toHaveBeenCalledWith(JSON.stringify({ password: 'secret' }));
    expect(prisma.emailAccount.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { credentialsCiphertext: 'encrypted-value', status: EmailAccountStatus.ACTIVE },
    }));
    expect(result).toEqual({ saved: true, status: EmailAccountStatus.ACTIVE, message: 'Credentials validated' });
  });

  it('ingests incoming data against the receiving email account and starts unread', async () => {
    prisma.emailAccount.findFirst.mockResolvedValue({ id: 'account-1', emailAddress: 'support@example.com' });
    const tx = {
      emailThread: {
        create: jest.fn().mockResolvedValue({ id: 'thread-1' }),
        update: jest.fn(),
      },
      emailMessage: { create: jest.fn().mockResolvedValue({ id: 'message-1' }) },
    };
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) => callback(tx));

    const result = await service.ingestMessage('tenant-1', 'account-1', {
      fromAddress: 'customer@example.com',
      toAddresses: ['support@example.com'],
      subject: 'Order help',
      textBody: 'Where is my order?',
    });

    expect(tx.emailThread.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant-1', emailAccountId: 'account-1', unreadCount: 0 }),
    }));
    expect(tx.emailMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ emailAccountId: 'account-1', direction: 'INBOUND', isRead: false }),
    }));
    expect(result).toEqual({ threadId: 'thread-1', messageId: 'message-1', receivingEmailAccountId: 'account-1' });
  });

  it('links a thread to existing customer and order records', async () => {
    prisma.emailThread.findFirst.mockResolvedValue({ id: 'thread-1' });
    prisma.customer.findFirst.mockResolvedValue({ id: 'customer-1' });
    prisma.order.findFirst.mockResolvedValue({ id: 'order-1' });
    prisma.emailThread.update.mockResolvedValue({ id: 'thread-1', customerId: 'customer-1', orderId: 'order-1', ticketId: 'ticket-1' });

    await expect(service.linkThread('tenant-1', 'thread-1', { customerId: 'customer-1', orderId: 'order-1', ticketId: 'ticket-1' }))
      .resolves.toEqual({ id: 'thread-1', customerId: 'customer-1', orderId: 'order-1', ticketId: 'ticket-1' });
  });
});
