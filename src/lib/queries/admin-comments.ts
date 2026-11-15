import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { serviceComments, services } from '@/lib/db/schema';

/** Moderator only: pending comments must not be exposed via public APIs. */
export function buildPendingCommentsQuery() {
  return db.select({
    id: serviceComments.id,
    serviceName: services.name,
    serviceSlug: services.slug,
    body: serviceComments.body,
    createdAt: serviceComments.createdAt,
  })
    .from(serviceComments)
    .innerJoin(services, eq(services.id, serviceComments.serviceId))
    .where(eq(serviceComments.moderationStatus, 'pending'))
    .orderBy(asc(serviceComments.createdAt))
    .limit(50);
}

export function moderationOutcome(action: 'approve' | 'reject') {
  return action === 'approve' ? 'approved' as const : 'rejected' as const;
}

export async function getPendingCommentsQueue() {
  const rows = await buildPendingCommentsQuery();
  return rows.map((item) => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
  }));
}
