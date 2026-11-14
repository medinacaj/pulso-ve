import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import {
  ADMIN_SESSION_COOKIE,
  adminPasswordFingerprint,
  readAdminSettings,
  verifyAdminSession,
} from './admin-security';

/** Every protected server render revalidates role, status and password version. */
export async function getAuthorizedAdmin() {
  let settings;
  try {
    settings = readAdminSettings();
  } catch {
    return null;
  }

  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = verifyAdminSession(token, settings.jwtSecret);
  if (!claims) return null;

  const [user] = await db.select({
    id: users.id,
    email: users.email,
    passwordHash: users.passwordHash,
    role: users.role,
    status: users.status,
  }).from(users).where(eq(users.id, claims.sub)).limit(1);

  if (!user || user.role !== 'admin' || user.status !== 'active' ||
      adminPasswordFingerprint(user.passwordHash) !== claims.pwd) return null;

  return { id: user.id, email: user.email };
}
