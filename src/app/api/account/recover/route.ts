import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import {
  accountSafeReply, normalizeAccountEmail, signAccountAction,
} from '@/lib/auth/account-security';
import {
  accountBadRequest, accountUnavailable, guardAccountWrite, limitAccountRequest,
} from '@/lib/auth/account-request';
import { sendAccountActionEmail } from '@/lib/auth/account-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const guard = guardAccountWrite(request);
  if (!guard.allowed) return guard.response;
  if (Number(request.headers.get('content-length') ?? '0') > 2048) return accountBadRequest();

  let input: unknown;
  try { input = await request.json(); } catch { return accountBadRequest(); }
  const parsed = z.object({ email: z.email().max(255) }).strict().safeParse(input);
  if (!parsed.success) return accountBadRequest();

  const email = normalizeAccountEmail(parsed.data.email);
  try {
    const throttle = await limitAccountRequest(request, guard.settings, 'recover', email);
    if (throttle) return throttle;

    const [user] = await db.select({
      id: users.id, email: users.email, status: users.status,
      role: users.role, passwordHash: users.passwordHash,
    }).from(users).where(eq(users.email, email)).limit(1);
    if (user && user.role === 'user' && user.status === 'active') {
      const token = signAccountAction(
        'reset_password', user.id, user.email, user.passwordHash, guard.settings.secret,
      );
      const sent = await sendAccountActionEmail({
        kind: 'reset_password', recipient: email, token, settings: guard.settings,
      });
      if (!sent) console.error('PulsoVE accounts: reset email unavailable');
    }
    return accountSafeReply();
  } catch {
    console.error('PulsoVE accounts: password recovery unavailable');
    return accountUnavailable();
  }
}
