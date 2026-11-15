import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendAccountActionEmail } from '../src/lib/auth/account-email';
import type { AccountSettings } from '../src/lib/auth/account-security';

const settings: AccountSettings = {
  secret: 'nWqe7HArFfYK6jXze5GJn7StLdd9s6WqKjRq9VH8e13KzD59uT8WcHM4',
  origin: 'https://staging.example.org',
  resendKey: 're_FAKE_NO_REAL_SENDING_0123456789',
  mailFrom: 'cuentas@example.org',
};
afterEach(() => vi.unstubAllGlobals());

describe('transporte transaccional protegido', () => {
  it('usa endpoint fijo HTTPS, remitente explícito y mínimo dato personal necesario', async () => {
    const sender = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', sender);
    const outcome = await sendAccountActionEmail({
      kind: 'verify_email',
      recipient: 'verified@example.org',
      token: 'SIGNED_TEST_TOKEN',
      settings,
    });
    expect(outcome).toBe(true);
    expect(sender).toHaveBeenCalledTimes(1);
    const [endpoint, options] = sender.mock.calls[0];
    expect(endpoint).toBe('https://api.resend.com/emails');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toContain('Bearer re_FAKE_');
    const payload = JSON.parse(options.body);
    expect(payload.from).toBe('cuentas@example.org');
    expect(payload.to).toEqual(['verified@example.org']);
    expect(payload.subject).toMatch(/verifica/);
    expect(payload.text).toContain('/cuenta/verificar?token=SIGNED_TEST_TOKEN');
    expect(payload).not.toHaveProperty('html');
  });

  it('no declara enviado un correo que el proveedor rechaza', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    expect(await sendAccountActionEmail({
      kind: 'reset_password', recipient: 'verified@example.org', token: 'TOKEN', settings,
    })).toBe(false);
  });

  it('no filtra errores del proveedor ni intenta un segundo host', async () => {
    const sender = vi.fn().mockRejectedValue(new Error('sensitive-provider-detail'));
    vi.stubGlobal('fetch', sender);
    expect(await sendAccountActionEmail({
      kind: 'reset_password', recipient: 'verified@example.org', token: 'TOKEN', settings,
    })).toBe(false);
    expect(sender).toHaveBeenCalledTimes(1);
  });
});
