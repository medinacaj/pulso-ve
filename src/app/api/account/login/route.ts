import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import {
  accountPasswordValid, normalizeAccountEmail, signUserSession,
  USER_SESSION_COOKIE, USER_SESSION_TTL_SECONDS,
} from '@/lib/auth/account-security';
import {
  accountBadRequest, accountUnavailable, guardAccountWrite, limitAccountRequest,
} from '@/lib/auth/account-request';

import { readLimitedJson } from '@/lib/api/limited-json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Run the same cost even when the email is unknown to reduce timing-based enumeration.
let dummyHashPromise: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  dummyHashPromise ??= bcrypt.hash('PulsoVE-unknown-account-comparison-only', 12);
  return dummyHashPromise;
}

export async function POST(request: Request): Promise<Response> {
  const guard = guardAccountWrite(request);
  if (!guard.allowed) return guard.response;

  let input: unknown;
  try { input = await readLimitedJson(request, 4096); } catch { return accountBadRequest(); }
  const parsed = z.object({
    email: z.email().max(255),
    password: z.string().min(1).max(128),
  }).strict().safeParse(input);
  if (!parsed.success || Buffer.byteLength(parsed.data.password, 'utf8') > 72) {
    return accountBadRequest();
  }
  const email = normalizeAccountEmail(parsed.data.email);

  try {
    const throttle = await limitAccountRequest(request, guard.settings, 'login', email);
    if (throttle) return throttle;
    const [user] = await db.select({
      id: users.id, email: users.email, passwordHash: users.passwordHash,
      status: users.status, role: users.role,
    }).from(users).where(eq(users.email, email)).limit(1);
    const validPassword = await bcrypt.compare(
      parsed.data.password, user?.passwordHash ?? await dummyHash(),
    );
    if (!user || !validPassword || user.role !== 'user' || user.status !== 'active') {
      return Response.json({ error: 'invalid_credentials' }, {
        status: 401, headers: { 'Cache-Control': 'no-store' },
      });
    }

    const session = signUserSession(user.id, user.email, user.passwordHash, guard.settings.secret);
    const response = NextResponse.json({ status: 'signed_in' }, {
      headers: { 'Cache-Control': 'no-store' },
    });
    response.cookies.set({
      name: USER_SESSION_COOKIE, value: session,
      httpOnly: true, secure: true, sameSite: 'strict', path: '/',
      maxAge: USER_SESSION_TTL_SECONDS,
    });
    return response;
  } catch {
    console.error('PulsoVE accounts: login unavailable');
    return accountUnavailable();
  }
}
