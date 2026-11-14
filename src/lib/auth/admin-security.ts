import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';

export const ADMIN_SESSION_COOKIE = 'pulsove_admin_session';
export const ADMIN_SESSION_TTL_SECONDS = 15 * 60;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export type AdminSettings = {
  jwtSecret: string;
  totpSecret: string;
  siteOrigin: string;
};

export function readAdminSettings(): AdminSettings {
  if (process.env.ADMIN_ACCESS_ENABLED !== 'true') throw Error('admin_disabled');

  const jwtSecret = process.env.JWT_SECRET ?? '';
  const totpSecret = process.env.ADMIN_TOTP_SECRET_BASE32 ?? '';
  const siteUrl = process.env.SITE_URL ?? '';

  if (jwtSecret.length < 40 || jwtSecret.toLowerCase().includes('reemplazar')) {
    throw Error('admin_not_configured');
  }
  if (!/^[A-Z2-7]{32,}$/i.test(totpSecret)) throw Error('admin_not_configured');

  let siteOrigin: string;
  try {
    const url = new URL(siteUrl);
    if (url.protocol !== 'https:' || url.username || url.password ||
        url.pathname !== '/' || url.search || url.hash) throw Error();
    siteOrigin = url.origin;
  } catch {
    throw Error('admin_not_configured');
  }
  return { jwtSecret, totpSecret: totpSecret.toUpperCase(), siteOrigin };
}

function decodeBase32(input: string): Buffer {
  const normalized = input.replace(/=+$/, '').toUpperCase();
  if (!/^[A-Z2-7]{32,}$/.test(normalized)) throw Error('invalid_totp_config');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** RFC 6238 SHA-1, 6 digits and a 30-second step. */
export function totpAt(secretBase32: string, nowMs: number): string {
  const secret = decodeBase32(secretBase32);
  const counter = BigInt(Math.floor(nowMs / 30_000));
  const count = Buffer.alloc(8);
  count.writeBigUInt64BE(counter);
  const digest = createHmac('sha1', secret).update(count).digest();
  const offset = digest[digest.length - 1] & 15;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

export function verifyAdminTotp(secretBase32: string, input: string, nowMs = Date.now()): boolean {
  if (!/^\d{6}$/.test(input)) return false;
  try {
    const supplied = Buffer.from(input, 'utf8');
    for (const offset of [-30_000, 0, 30_000]) {
      const expected = Buffer.from(totpAt(secretBase32, nowMs + offset), 'utf8');
      if (timingSafeEqual(supplied, expected)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function adminPasswordFingerprint(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 24);
}

export type AdminClaims = {
  sub: string;
  role: 'admin';
  mfa: true;
  pwd: string;
};

export function createAdminSession(userId: string, passwordHash: string, secret: string): string {
  return jwt.sign(
    { role: 'admin', mfa: true, pwd: adminPasswordFingerprint(passwordHash) },
    secret,
    {
      subject: userId,
      issuer: 'pulsove',
      audience: 'pulsove-admin',
      algorithm: 'HS256',
      jwtid: randomUUID(),
      expiresIn: ADMIN_SESSION_TTL_SECONDS,
    },
  );
}

export function verifyAdminSession(token: string, secret: string): AdminClaims | null {
  try {
    const value = jwt.verify(token, secret, {
      issuer: 'pulsove',
      audience: 'pulsove-admin',
      algorithms: ['HS256'],
    });
    if (!value || typeof value === 'string' ||
        value.role !== 'admin' || value.mfa !== true ||
        typeof value.sub !== 'string' || !/^[a-f0-9-]{36}$/i.test(value.sub) ||
        typeof value.pwd !== 'string' || value.pwd.length !== 24) return null;
    return { sub: value.sub, role: 'admin', mfa: true, pwd: value.pwd };
  } catch {
    return null;
  }
}

/** Browser must come from the configured HTTPS origin; no permissive CORS. */
export function isAdminWriteOriginAllowed(request: Request, siteOrigin: string): boolean {
  return request.headers.get('origin') === siteOrigin;
}
