import bcrypt from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import {
  accountFingerprint, accountPasswordValid, verifyAccountAction,
} from '@/lib/auth/account-security';
import {
  accountBadRequest, accountUnavailable, guardAccountWrite, limitAccountRequest,
} from '@/lib/auth/account-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const guard = guardAccountWrite(request);
  if (!guard.allowed) return guard.response;
  if (Number(request.headers.get('content-length') ?? '0') > 4096) return accountBadRequest();

  let input: unknown;
  try { input = await request.json(); } catch { return accountBadRequest(); }
  const parsed = z.object({
    token: z.string().min(30).max(4096),
    password: z.string().min(12).max(128),
  }).strict().safeParse(input);
  if (!parsed.success || !accountPasswordValid(parsed.data.password)) return accountBadRequest();

  const claims = verifyAccountAction(parsed.data.token, 'reset_password', guard.settings.secret);
  if (!claims) return accountBadRequest();

  try {
    const throttle = await limitAccountRequest(request, guard.settings, 'reset', claims.email);
    if (throttle) return throttle;
    const [user] = await db.select({
      id: users.id, email: users.email, role: users.role,
      status: users.status, passwordHash: users.passwordHash,
    }).from(users).where(eq(users.id, claims.sub)).limit(1);

    if (!user || user.email !== claims.email || user.role !== 'user' ||
        user.status !== 'active' || accountFingerprint(user.passwordHash) !== claims.pwd) {
      return accountBadRequest();
    }

    const newHash = await bcrypt.hash(parsed.data.password, 12);
    // Match previous hash atomically: only first concurrent reset can apply.
    // Password rotation invalidates existing user sessions and pending reset links.
    const [changed] = await db.update(users)
      .set({ passwordHash: newHash })
      .where(and(
        eq(users.id, user.id),
        eq(users.email, claims.email),
        eq(users.role, 'user'),
        eq(users.status, 'active'),
        eq(users.passwordHash, user.passwordHash),
      ))
      .returning({ id: users.id });
    if (!changed) return accountBadRequest();

    return Response.json({ status: 'password_updated' }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    console.error('PulsoVE accounts: password reset unavailable');
    return accountUnavailable();
  }
}
