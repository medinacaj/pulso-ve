import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import {
  accountPasswordValid, accountSafeReply, normalizeAccountEmail, signAccountAction,
} from '@/lib/auth/account-security';
import {
  accountBadRequest, accountUnavailable, guardAccountWrite, limitAccountRequest,
} from '@/lib/auth/account-request';
import { sendAccountActionEmail } from '@/lib/auth/account-email';

import { readLimitedJson } from '@/lib/api/limited-json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  email: z.email().max(255),
  password: z.string().min(12).max(128),
}).strict();

export async function POST(request: Request): Promise<Response> {
  const guard = guardAccountWrite(request);
  if (!guard.allowed) return guard.response;

  let body: unknown;
  try { body = await readLimitedJson(request, 4096); } catch { return accountBadRequest(); }
  const parsed = schema.safeParse(body);
  if (!parsed.success || !accountPasswordValid(parsed.data.password)) return accountBadRequest();
  const email = normalizeAccountEmail(parsed.data.email);
  try {
    const throttle = await limitAccountRequest(request, guard.settings, 'register', email);
    if (throttle) return throttle;

    // Never allow public enrollment into the reserved owner identity.
    if (email === normalizeAccountEmail(process.env.ADMIN_OWNER_EMAIL ?? '')) {
      return accountSafeReply();
    }
    // Always hash before DB conflict handling to reduce timing disclosure.
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const [created] = await db.insert(users)
      .values({ email, passwordHash, role: 'user', status: 'pending' })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id, email: users.email, passwordHash: users.passwordHash });

    if (created) {
      const token = signAccountAction(
        'verify_email', created.id, created.email, created.passwordHash, guard.settings.secret,
      );
      const sent = await sendAccountActionEmail({
        kind: 'verify_email', recipient: email, token, settings: guard.settings,
      });
      if (!sent) console.error('PulsoVE accounts: verification delivery unavailable');
    }
    // Never reveal whether the email was already in the database.
    return accountSafeReply();
  } catch {
    console.error('PulsoVE accounts: registration unavailable');
    return accountUnavailable();
  }
}
