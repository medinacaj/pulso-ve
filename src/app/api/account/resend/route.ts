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

import { readLimitedJson } from '@/lib/api/limited-json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const guard = guardAccountWrite(request);
  if (!guard.allowed) return guard.response;

  let body: unknown;
  try { body = await readLimitedJson(request, 2048); } catch { return accountBadRequest(); }
  const parsed = z.object({ email: z.email().max(255) }).strict().safeParse(body);
  if (!parsed.success) return accountBadRequest();

  const email = normalizeAccountEmail(parsed.data.email);
  try {
    const throttle = await limitAccountRequest(request, guard.settings, 'resend', email);
    if (throttle) return throttle;
    const [user] = await db
      .select({ id: users.id, email: users.email, passwordHash: users.passwordHash,
        status: users.status, role: users.role })
      .from(users).where(eq(users.email, email)).limit(1);
    if (user && user.status === 'pending' && user.role === 'user') {
      const token = signAccountAction(
        'verify_email', user.id, user.email, user.passwordHash, guard.settings.secret,
      );
      const sent = await sendAccountActionEmail({
        kind: 'verify_email', recipient: email, token, settings: guard.settings,
      });
      if (!sent) console.error('PulsoVE accounts: verification resend unavailable');
    }
    return accountSafeReply();
  } catch {
    console.error('PulsoVE accounts: resend unavailable');
    return accountUnavailable();
  }
}
