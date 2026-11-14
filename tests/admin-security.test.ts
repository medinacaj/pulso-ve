import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adminPasswordFingerprint,
  createAdminSession,
  isAdminWriteOriginAllowed,
  readAdminSettings,
  totpAt,
  verifyAdminSession,
  verifyAdminTotp,
} from '../src/lib/auth/admin-security';

const TEST_TOTP_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
const TEST_JWT_SECRET = 'LOCAL_ONLY_TEST_JWT_SECRET_12345678901234567890123456789';
const TEST_ADMIN_ID = '00000000-0000-4000-8000-000000000001';

afterEach(() => vi.unstubAllEnvs());

describe('seguridad MFA del Centro de Control', () => {
  it('verifica RFC 6238 HMAC SHA1 con ventana temporal estrecha', () => {
    expect(totpAt(TEST_TOTP_SECRET, 59_000)).toBe('287082');
    expect(verifyAdminTotp(TEST_TOTP_SECRET, '287082', 59_000)).toBe(true);
    expect(verifyAdminTotp(TEST_TOTP_SECRET, '287082', 119_000)).toBe(false);
    expect(verifyAdminTotp(TEST_TOTP_SECRET, '000000', 59_000)).toBe(false);
    expect(verifyAdminTotp('INVALID', '287082', 59_000)).toBe(false);
  });

  it('mantiene acceso deshabilitado si falta configuración de producción', () => {
    vi.stubEnv('ADMIN_ACCESS_ENABLED', 'false');
    expect(() => readAdminSettings()).toThrow('admin_disabled');
    vi.stubEnv('ADMIN_ACCESS_ENABLED', 'true');
    vi.stubEnv('JWT_SECRET', 'reemplazar-con-un-secreto');
    vi.stubEnv('ADMIN_TOTP_SECRET_BASE32', TEST_TOTP_SECRET);
    vi.stubEnv('SITE_URL', 'https://pulsove.example.org');
    expect(() => readAdminSettings()).toThrow('admin_not_configured');
    vi.stubEnv('JWT_SECRET', TEST_JWT_SECRET);
    vi.stubEnv('SITE_URL', 'http://pulsove.example.org');
    expect(() => readAdminSettings()).toThrow('admin_not_configured');
    vi.stubEnv('SITE_URL', 'https://pulsove.example.org');
    expect(readAdminSettings().siteOrigin).toBe('https://pulsove.example.org');
  });

  it('requiere origen idéntico al dominio HTTPS autorizado', () => {
    const origin = 'https://pulsove.example.org';
    expect(isAdminWriteOriginAllowed(new Request(origin, { headers: { origin } }), origin)).toBe(true);
    expect(isAdminWriteOriginAllowed(new Request(origin, { headers: { origin: 'https://attacker.test' } }), origin)).toBe(false);
    expect(isAdminWriteOriginAllowed(new Request(origin), origin)).toBe(false);
  });

  it('expide sesiones con MFA y enlace al hash de la contraseña; rechaza firma incorrecta', () => {
    const token = createAdminSession(TEST_ADMIN_ID, 'hashed-password-A', TEST_JWT_SECRET);
    const claims = verifyAdminSession(token, TEST_JWT_SECRET);
    expect(claims).toMatchObject({
      sub: TEST_ADMIN_ID,
      role: 'admin',
      mfa: true,
      pwd: adminPasswordFingerprint('hashed-password-A'),
    });
    expect(claims?.pwd).not.toBe(adminPasswordFingerprint('hashed-password-B'));
    expect(verifyAdminSession(token, TEST_JWT_SECRET + '-wrong')).toBeNull();
  });
});
