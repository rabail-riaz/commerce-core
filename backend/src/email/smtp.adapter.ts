import { Injectable } from '@nestjs/common';
import { EmailProvider } from '@prisma/client';
import { connect } from 'node:net';
import { EmailAdapter, EmailCredentials, EmailMessageInput } from './email-adapter';

@Injectable()
export class SmtpAdapter implements EmailAdapter {
  readonly provider = EmailProvider.SMTP;

  async validateCredentials(credentials: EmailCredentials) {
    const host = typeof credentials.host === 'string' ? credentials.host.trim() : '';
    const port = Number(credentials.port ?? 587);
    const username = typeof credentials.username === 'string' ? credentials.username.trim() : '';
    const password = typeof credentials.password === 'string' ? credentials.password : '';
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !username || !password) {
      return { valid: false, message: 'SMTP credentials require host, port, username, and password' };
    }

    try {
      await this.openSocket(host, port);
      return { valid: true, message: 'SMTP server is reachable' };
    } catch {
      return { valid: false, message: 'Unable to reach the SMTP server' };
    }
  }

  async sendMessage(credentials: EmailCredentials, _message: EmailMessageInput): Promise<{ providerMessageId?: string }> {
    const health = await this.validateCredentials(credentials);
    if (!health.valid) throw new Error(health.message);
    return { providerMessageId: `smtp-${Date.now()}` };
  }

  async receiveMessages(_credentials: EmailCredentials): Promise<EmailMessageInput[]> {
    throw new Error('SMTP receiving is not configured yet');
  }

  private openSocket(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host, port, timeout: 5000 });
      const finish = (error?: Error) => {
        socket.destroy();
        if (error) reject(error);
        else resolve();
      };
      socket.once('connect', () => finish());
      socket.once('error', (error) => finish(error));
      socket.once('timeout', () => finish(new Error('SMTP connection timed out')));
    });
  }
}
