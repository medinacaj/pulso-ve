import { createHash, createHmac, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';

export const USER_SESSION_COOKIE = 'pulsove_user_session';
export const USER_SESSION_TTL_SECONDS = 12 * 60 * 60;
export type ActionKind = 'verify_email' | 'reset_password';

export type AccountSettings = {
  secret: string;
  origin: string;
  resendKey: string;
  mailFrom: string;
};

export function readAccountSettings(): AccountSettings {
  if (process.env.PUBLIC_ACCOUNTS_ENABLED !== 'true') throw new Error('accounts_disabled');

  const secret = process.env.ACCOUNT_TOKEN_SECRET ?? '';
  const resendKey = process.env.RESEND_API_KEY ?? '';
  const mailFrom = process.env.ACCOUNT_MAIL_FROM ?? '';
  if (secret.length < 48 || /reemplazar|example|test_secret|ci_only/i.test(secret)) {
    throw new Error('accounts_not_configured');
  }
  if (!/^re_[a-zA-Z0-9_-]{10,}$/.test(resendKey) ||
      !/^[^<>\r\n\s@]+@[^<>\r\n\s@]+\.[^<>\r\n\s@]+$/.test(mailFrom)) {
    throw new Error('accounts_not_configured');
  }

  let origin: string;
  try {
    const parsed = new URL(process.env.SITE_URL ?? '');
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
        parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error();
    origin = parsed.origin;
  } catch {
    throw new Error('accounts_not_configured');
  }
  return { secret, origin, resendKey, mailFrom };
}

export function normalizeAccountEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function accountPasswordValid(password: string): boolean {
  return password.length >= 12 && Buffer.byteLength(password, 'utf8') <= 72 &&
    Buffer.byteLength(password, 'utf8') >= 12;
}

export function accountFingerprint(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 24);
}

type TokenPayload = {
  sub: string;
  email: string;
  pwd: string;
  kind: ActionKind | 'user_session';
};

export function signAccountAction(
  kind: ActionKind, id: string, email: string, passwordHash: string, secret: string,
): string {
  return jwt.sign(
    { kind, email, pwd: accountFingerprint(passwordHash) },
    secret,
    {
      algorithm: 'HS256',
      issuer: 'pulsove',
      audience: 'pulsove-account-action',
      subject: id,
      jwtid: randomUUID(),
      expiresIn: kind === 'verify_email' ? 24 * 60 * 60 : 15 * 60,
    },
  );
}

export function verifyAccountAction(token: string, kind: ActionKind, secret: string): TokenPayload | null {
  try {
    const claims = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: 'pulsove',
      audience: 'pulsove-account-action',
    });
    if (typeof claims === 'string' || !claims ||
        claims.kind !== kind || typeof claims.sub !== 'string' ||
        !/^[0-9a-f-]{36}$/i.test(claims.sub) ||
        typeof claims.email !== 'string' ||
        normalizeAccountEmail(claims.email) !== claims.email ||
        typeof claims.pwd !== 'string' || !/^[0-9a-f]{24}$/.test(claims.pwd)) return null;
    return { sub: claims.sub, email: claims.email, pwd: claims.pwd, kind };
  } catch {
    return null;
  }
}

export function signUserSession(id: string, email: string, passwordHash: string, secret: string): string {
  return jwt.sign(
    { kind: 'user_session', email, pwd: accountFingerprint(passwordHash) },
    secret,
    {
      issuer: 'pulsove',
      audience: 'pulsove-user-session',
      subject: id,
      jwtid: randomUUID(),
      algorithm: 'HS256',
      expiresIn: USER_SESSION_TTL_SECONDS,
    },
  );
}

export function verifyUserSession(token: string, secret: string): TokenPayload | null {
  try {
    const claims = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: 'pulsove',
      audience: 'pulsove-user-session',
    });
    if (typeof claims === 'string' || !claims ||
        claims.kind !== 'user_session' || typeof claims.sub !== 'string' ||
        !/^[0-9a-f-]{36}$/i.test(claims.sub) ||
        typeof claims.email !== 'string' || normalizeAccountEmail(claims.email) !== claims.email ||
        typeof claims.pwd !== 'string' || !/^[0-9a-f]{24}$/.test(claims.pwd)) return null;
    return { sub: claims.sub, email: claims.email, pwd: claims.pwd, kind: 'user_session' };
  } catch {
    return null;
  }
}

/** Fail closed on cross-site writes, including requests that omit Origin. */
export function accountWriteOriginAllowed(request: Request, origin: string): boolean {
  return request.headers.get('origin') === origin;
}

export function accountRateKey(email: string, secret: string): string {
  return createHmac('sha256', secret).update(email).digest('hex');
}

export function accountActionUrl(origin: string, kind: ActionKind, token: string): string {
  const path = kind === 'verify_email' ? '/cuenta/verificar' : '/cuenta/restablecer';
  const url = new URL(path, origin);
  // Fragment is client-only; tokens do not appear in GET or proxy access logs.
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}

export function accountSafeReply(status = 202): Response {
  return Response.json({
    message: 'Si la cuenta puede procesar esta solicitud, enviaremos instrucciones al correo registrado.',
  }, { status, headers: { 'Cache-Control': 'no-store' } });
}
