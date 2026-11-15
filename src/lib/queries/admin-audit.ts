import { desc } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { auditLogs } from '@/lib/db/schema';

/** Security review: never project before/after JSON, IP hashes or actor email.
 * Called only after getAuthorizedAdmin validates the session and role in SSR.
 */
export function buildRecentAuditEventsQuery() {
  return db.select({
    id: auditLogs.id,
    action: auditLogs.action,
    entity: auditLogs.entity,
    createdAt: auditLogs.createdAt,
  }).from(auditLogs)
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(100);
}

export async function getRecentAuditEvents() {
  const rows = await buildRecentAuditEventsQuery();
  return rows.map((item) => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
  }));
}
