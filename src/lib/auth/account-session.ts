import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import {
  accountFingerprint,
  readAccountSettings,
  USER_SESSION_COOKIE,
  verifyUserSession,
} from './account-security';

export async function getSignedInUser() {
  let config;
  try {
    config = readAccountSettings();
  } catch {
    return null;
  }
  const token = (await cookies()).get(USER_SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = verifyUserSession(token, config.secret);
  if (!claims) return null;
  const [user] = await db.select({
    id: users.id, email: users.email, role: users.role,
    status: users.status, passwordHash: users.passwordHash,
  }).from(users).where(eq(users.id, claims.sub)).limit(1);
  if (!user || user.role !== 'user' || user.status !== 'active' ||
      user.email !== claims.email ||
      accountFingerprint(user.passwordHash) !== claims.pwd) {
    return null;
  }
  return { id: user.id, email: user.email };
}
