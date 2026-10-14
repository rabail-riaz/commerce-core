import { SmtpAdapter } from './smtp.adapter';

describe('SmtpAdapter', () => {
  it('rejects incomplete credentials without attempting a connection', async () => {
    const adapter = new SmtpAdapter();
    await expect(adapter.validateCredentials({ host: 'smtp.example.com' })).resolves.toEqual({
      valid: false,
      message: 'SMTP credentials require host, port, username, and password',
    });
  });

  it('validates port ranges before connecting', async () => {
    const adapter = new SmtpAdapter();
    await expect(adapter.validateCredentials({ host: 'smtp.example.com', port: 70000, username: 'user', password: 'secret' })).resolves.toEqual({
      valid: false,
      message: 'SMTP credentials require host, port, username, and password',
    });
  });
});
