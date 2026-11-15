import { checkRateLimit } from '@/lib/security/rate-limit';
import { getClientIp } from '@/lib/privacy';
import {
  accountRateKey,
  accountWriteOriginAllowed,
  readAccountSettings,
  type AccountSettings,
} from './account-security';

export type AccountGuard =
  | { allowed: true; settings: AccountSettings }
  | { allowed: false; response: Response };

function refuse(status: number, code: string) {
  return Response.json({ error: code }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/** All writes fail closed if the provider/site configuration is missing. */
export function guardAccountWrite(request: Request): AccountGuard {
  let settings: AccountSettings;
  try {
    settings = readAccountSettings();
  } catch {
    return { allowed: false, response: refuse(503, 'accounts_unavailable') };
  }
  if (!accountWriteOriginAllowed(request, settings.origin)) {
    return { allowed: false, response: refuse(403, 'forbidden_origin') };
  }
  return { allowed: true, settings };
}

/**
 * Per-email HMAC keys and per-trusted-IP keys.
 * Unknown IPs share a conservative aggregate bucket (not unlimited).
 */
export async function limitAccountRequest(
  request: Request,
  settings: AccountSettings,
  scope: 'register' | 'resend' | 'recover' | 'login' | 'verify' | 'reset',
  email: string,
): Promise<Response | null> {
  const ip = getClientIp(request);
  const key = accountRateKey(email, settings.secret);
  const networkKey = accountRateKey(ip === '0.0.0.0' ? 'unknown_ip' : ip, settings.secret);
  const [perEmail, perNetwork] = await Promise.all([
    checkRateLimit('account:' + scope + ':email:' + key, scope === 'login' ? 8 : 4, 900),
    checkRateLimit('account:' + scope + ':network:' + networkKey, ip === '0.0.0.0' ? 100 : 30, 900),
  ]);
  if (!perEmail.allowed || !perNetwork.allowed) {
    return refuse(429, 'rate_limited');
  }
  return null;
}

export function accountBadRequest(): Response {
  return refuse(400, 'invalid_request');
}

export function accountUnavailable(): Response {
  return refuse(503, 'accounts_temporarily_unavailable');
}
