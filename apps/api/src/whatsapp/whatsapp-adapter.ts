export type WhatsAppCredentials = {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId?: string;
};

export type WhatsAppOutboundMessage = {
  to: string;
  body: string;
  templateName?: string;
};

export interface WhatsAppAdapter {
  readonly provider: string;
  validateCredentials(credentials: WhatsAppCredentials): Promise<{ valid: boolean; message: string }>;
  sendMessage(credentials: WhatsAppCredentials, message: WhatsAppOutboundMessage): Promise<{ providerMessageId: string; status: string }>;
}
