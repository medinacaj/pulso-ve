import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { serviceEndpoints, services, technicalChecks } from '@/lib/db/schema';

export type MonitorReadiness = 'disabled' | 'not_configured' | 'stale' | 'ok';

export function classifyMonitorReadiness(
  enabled: boolean,
  endpoints: number,
  recentlyChecked: number,
): MonitorReadiness {
  if (!enabled) return 'disabled';
  if (endpoints < 1) return 'not_configured';
  if (recentlyChecked < endpoints) return 'stale';
  return 'ok';
}

/** Reads verification timestamps, not provider status. */
export function buildMonitorReadinessQuery(since: Date) {
  const latest = db
    .select({
      endpointId: technicalChecks.serviceEndpointId,
      lastCheck: sql<Date | null>`max(${technicalChecks.checkedAt})`,
    })
    .from(technicalChecks)
    .groupBy(technicalChecks.serviceEndpointId)
    .as('monitor_latest_check');

  return db
    .select({
      configured: sql<number>`count(*)::int`,
      recentlyChecked: sql<number>`count(*) filter (where ${latest.lastCheck} >= ${since})::int`,
      newestCheck: sql<Date | null>`max(${latest.lastCheck})`,
    })
    .from(serviceEndpoints)
    .innerJoin(services, eq(services.id, serviceEndpoints.serviceId))
    .leftJoin(latest, eq(latest.endpointId, serviceEndpoints.id))
    .where(and(
      eq(services.active, true),
      eq(services.isDemo, false),
      eq(serviceEndpoints.active, true),
      eq(serviceEndpoints.type, 'https'),
    ));
}

export async function getMonitorReadinessCounts(since: Date) {
  const [row] = await buildMonitorReadinessQuery(since);
  return {
    configured: row?.configured ?? 0,
    recentlyChecked: row?.recentlyChecked ?? 0,
    newestCheck: row?.newestCheck ?? null,
  };
}
