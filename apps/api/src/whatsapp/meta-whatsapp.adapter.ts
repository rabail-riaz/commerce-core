import { Injectable } from '@nestjs/common';
import { WhatsAppAdapter, WhatsAppCredentials, WhatsAppOutboundMessage } from './whatsapp-adapter';

@Injectable()
export class MetaWhatsAppAdapter implements WhatsAppAdapter {
  readonly provider = 'META';
  private readonly baseUrl = 'https://graph.facebook.com/v20.0';

  async validateCredentials(credentials: WhatsAppCredentials) {
    if (!credentials.accessToken || !credentials.phoneNumberId) return { valid: false, message: 'WhatsApp access token and phone number ID are required' };
    try {
      const response = await fetch(`${this.baseUrl}/${encodeURIComponent(credentials.phoneNumberId)}?fields=id`, {
        headers: { authorization: `Bearer ${credentials.accessToken}` },
      });
      if (!response.ok) return { valid: false, message: 'WhatsApp credentials were rejected' };
      return { valid: true, message: 'WhatsApp connection is healthy' };
    } catch {
      return { valid: false, message: 'Unable to reach WhatsApp provider' };
    }
  }

  async sendMessage(credentials: WhatsAppCredentials, message: WhatsAppOutboundMessage) {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(credentials.phoneNumberId)}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${credentials.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: message.to,
        type: message.templateName ? 'template' : 'text',
        ...(message.templateName
          ? { template: { name: message.templateName, language: { code: 'en_US' } } }
          : { text: { body: message.body } }),
      }),
    });
    if (!response.ok) throw new Error('WhatsApp provider rejected the message');
    const payload = await response.json() as { messages?: Array<{ id?: string }> };
    const providerMessageId = payload.messages?.[0]?.id;
    if (!providerMessageId) throw new Error('WhatsApp provider returned no message ID');
    return { providerMessageId, status: 'SENT' };
  }
}
