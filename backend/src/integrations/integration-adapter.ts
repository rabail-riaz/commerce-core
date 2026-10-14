export type IntegrationCredentials = Record<string, unknown>;

export interface IntegrationHealth {
  healthy: boolean;
  message: string;
  checkedAt: Date;
}

export interface IntegrationAdapter {
  readonly provider: string;
  testConnection(credentials: IntegrationCredentials): Promise<IntegrationHealth>;
  verifyWebhookSignature?(rawBody: Buffer, signature: string, secret: string): boolean;
  fetchCollection?(credentials: IntegrationCredentials, resource: string, page: number, perPage: number): Promise<{
    items: Record<string, unknown>[];
    hasMore: boolean;
  }>;
}
