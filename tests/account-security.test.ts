import { afterEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  accountActionUrl, accountFingerprint, accountPasswordValid,
  accountRateKey, accountWriteOriginAllowed, normalizeAccountEmail,
  readAccountSettings, signAccountAction, signUserSession,
  verifyAccountAction, verifyUserSession,
} from '../src/lib/auth/account-security';

const secret = 'nWqe7HArFfYK6jXze5GJn7StLdd9s6WqKjRq9VH8e13KzD59uT8WcHM4';
const userId = '00000000-0000-4000-8000-000000000001';
const email = 'verified@example.org';
const passHash = '$2a$12$anonymous-hash-do-not-use-for-password-verification';
const origin = 'https://staging.example.org';

afterEach(() => vi.unstubAllEnvs());

function enable() {
  vi.stubEnv('PUBLIC_ACCOUNTS_ENABLED', 'true');
  vi.stubEnv('ACCOUNT_TOKEN_SECRET', secret);
  vi.stubEnv('RESEND_API_KEY', 're_012345678901234567890123');
  vi.stubEnv('ACCOUNT_MAIL_FROM', 'cuentas@example.org');
  vi.stubEnv('SITE_URL', origin);
}

describe('registro público bloqueado hasta contar con proveedor y dominio validados', () => {
  it('no permite activar cuentas accidentalmente', () => {
    vi.stubEnv('PUBLIC_ACCOUNTS_ENABLED', 'false');
    expect(() => readAccountSettings()).toThrow('accounts_disabled');
    enable();
    expect(readAccountSettings()).toMatchObject({ origin, mailFrom: 'cuentas@example.org' });
    vi.stubEnv('SITE_URL', 'http://staging.example.org');
    expect(() => readAccountSettings()).toThrow('accounts_not_configured');
    vi.stubEnv('SITE_URL', origin);
    vi.stubEnv('ACCOUNT_TOKEN_SECRET', 'weak');
    expect(() => readAccountSettings()).toThrow('accounts_not_configured');
    vi.stubEnv('ACCOUNT_TOKEN_SECRET', secret);
    vi.stubEnv('RESEND_API_KEY', '');
    expect(() => readAccountSettings()).toThrow('accounts_not_configured');
  });

  it('exige origen exacto de servidor en solicitudes que escriben datos', () => {
    expect(accountWriteOriginAllowed(new Request(origin, { headers: { origin } }), origin)).toBe(true);
    expect(accountWriteOriginAllowed(new Request(origin), origin)).toBe(false);
    expect(accountWriteOriginAllowed(
      new Request(origin, { headers: { origin: 'https://evil.example.org' } }), origin,
    )).toBe(false);
  });

  it('normaliza email, protege la clave de rate limiting y valida máximo 72 bytes bcrypt', () => {
    expect(normalizeAccountEmail(' Verified@Example.ORG  ')).toBe(email);
    expect(accountRateKey(email, secret)).toMatch(/^[a-f0-9]{64}$/);
    expect(accountRateKey(email, secret)).not.toContain(email);
    expect(accountPasswordValid('a'.repeat(12))).toBe(true);
    expect(accountPasswordValid('a'.repeat(11))).toBe(false);
    expect(accountPasswordValid('a'.repeat(73))).toBe(false);
    expect(accountPasswordValid('á'.repeat(40))).toBe(false);
  });
});

describe('acciones firmadas y tokens de usuario', () => {
  it('vincula token de verificación a la cuenta, correo y versión de contraseña', () => {
    const token = signAccountAction('verify_email', userId, email, passHash, secret);
    const verified = verifyAccountAction(token, 'verify_email', secret);
    expect(verified).toMatchObject({
      sub: userId, email, kind: 'verify_email',
      pwd: accountFingerprint(passHash),
    });
    expect(verified?.pwd).not.toBe(accountFingerprint('a-different-password-hash'));
    expect(verifyAccountAction(token, 'reset_password', secret)).toBeNull();
    expect(verifyAccountAction(token, 'verify_email', secret + 'wrong')).toBeNull();
    expect(verifyAccountAction(token + 'invalid', 'verify_email', secret)).toBeNull();
  });

  it('fija vencimiento a 24h de verificación y 15min de recuperación', () => {
    const verify = jwt.decode(signAccountAction('verify_email', userId, email, passHash, secret)) as jwt.JwtPayload;
    const reset = jwt.decode(signAccountAction('reset_password', userId, email, passHash, secret)) as jwt.JwtPayload;
    expect(verify.exp! - verify.iat!).toBe(86400);
    expect(reset.exp! - reset.iat!).toBe(900);
  });

  it('separa sesiones de usuario y acciones de correo con audiencias distintas', () => {
    const session = signUserSession(userId, email, passHash, secret);
    expect(verifyUserSession(session, secret)).toMatchObject({ kind: 'user_session', sub: userId, email });
    expect(verifyAccountAction(session, 'verify_email', secret)).toBeNull();
    const action = signAccountAction('verify_email', userId, email, passHash, secret);
    expect(verifyUserSession(action, secret)).toBeNull();
  });

  it('genera enlaces absolutos sólo con origen validado y token', () => {
    const url = accountActionUrl(origin, 'verify_email', 'sample-token');
    expect(new URL(url).origin).toBe(origin);
    expect(new URL(url).pathname).toBe('/cuenta/verificar');
    expect(new URL(url).search).toBe('');
    expect(new URL(url).hash).toBe('#token=sample-token');
    expect(new URL(url).pathname).not.toContain('sample-token');
    expect(new URL(accountActionUrl(origin, 'reset_password', 'sample-token')).pathname)
      .toBe('/cuenta/restablecer');
  });
});
