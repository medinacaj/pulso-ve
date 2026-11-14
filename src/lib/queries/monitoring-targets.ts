import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { services, serviceEndpoints, technicalChecks } from '@/lib/db/schema';

/**
 * The newest first inspection is always the longest-unchecked endpoint.
 * Only manually approved, active HTTPS endpoints can be dispatched.
 * Import this module only when monitoring has explicitly been enabled.
 */
export function buildDueMonitorTargetsQuery() {
  const latest = db
    .select({
      endpointId: technicalChecks.serviceEndpointId,
      lastCheckedAt: sql<Date | null>`max(${technicalChecks.checkedAt})`.as('last_checked_at'),
    })
    .from(technicalChecks)
    .groupBy(technicalChecks.serviceEndpointId)
    .as('latest_technical_check');

  return db
    .select({
      id: serviceEndpoints.id,
      target: serviceEndpoints.target,
      frequencySeconds: serviceEndpoints.frequencySeconds,
      timeoutMs: serviceEndpoints.timeoutMs,
      lastCheckedAt: latest.lastCheckedAt,
    })
    .from(serviceEndpoints)
    .innerJoin(services, eq(services.id, serviceEndpoints.serviceId))
    .leftJoin(latest, eq(latest.endpointId, serviceEndpoints.id))
    .where(and(
      eq(serviceEndpoints.active, true),
      eq(serviceEndpoints.type, 'https'),
      eq(services.active, true),
      eq(services.isDemo, false),
    ))
    .orderBy(asc(latest.lastCheckedAt), asc(serviceEndpoints.id))
    .limit(2000);
}
