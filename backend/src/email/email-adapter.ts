import { EmailProvider } from '@prisma/client';

export type EmailCredentials = Record<string, unknown>;

export type EmailMessageInput = {
  fromAddress: string;
  toAddresses: string[];
  ccAddresses?: string[];
  bccAddresses?: string[];
  subject?: string;
  textBody?: string;
  htmlBody?: string;
};

export interface EmailAdapter {
  readonly provider: EmailProvider;
  validateCredentials(credentials: EmailCredentials): Promise<{ valid: boolean; message: string }>;
  sendMessage(credentials: EmailCredentials, message: EmailMessageInput): Promise<{ providerMessageId?: string }>;
  receiveMessages(credentials: EmailCredentials): Promise<EmailMessageInput[]>;
}
