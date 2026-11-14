import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { serviceEndpoints, technicalChecks } from '@/lib/db/schema';

export const TECHNICAL_HISTORY_PERIODS = {
  '24h': 24 * 60 * 60_000,
  '7d': 7 * 24 * 60 * 60_000,
  '30d': 30 * 24 * 60 * 60_000,
} as const;

export type TechnicalHistoryPeriod = keyof typeof TECHNICAL_HISTORY_PERIODS;

export function parseTechnicalHistoryPeriod(raw: string | null): TechnicalHistoryPeriod | null {
  if (raw === null) return '24h';
  return Object.prototype.hasOwnProperty.call(TECHNICAL_HISTORY_PERIODS, raw)
    ? raw as TechnicalHistoryPeriod
    : null;
}

export function technicalHistorySince(period: TechnicalHistoryPeriod, now = new Date()): Date {
  return new Date(now.getTime() - TECHNICAL_HISTORY_PERIODS[period]);
}

/**
 * Exposes only non-identifying technical measurements, never the endpoint URL,
 * internal metadata, DNS resolution, source authentication or personal data.
 */
export function buildServiceTechnicalHistoryQuery(serviceId: string, since: Date, limit = 200) {
  const boundedLimit = Number.isInteger(limit) ? Math.min(200, Math.max(1, limit)) : 200;
  return db
    .select({
      checkedAt: technicalChecks.checkedAt,
      success: technicalChecks.success,
      statusCode: technicalChecks.statusCode,
      latencyMs: technicalChecks.latencyMs,
      errorCode: technicalChecks.errorCode,
      checkType: technicalChecks.checkType,
    })
    .from(technicalChecks)
    .innerJoin(serviceEndpoints, eq(technicalChecks.serviceEndpointId, serviceEndpoints.id))
    .where(and(
      eq(serviceEndpoints.serviceId, serviceId),
      eq(technicalChecks.checkType, 'https'),
      gte(technicalChecks.checkedAt, since),
    ))
    .orderBy(desc(technicalChecks.checkedAt))
    .limit(boundedLimit);
}

export async function getServiceTechnicalHistory(serviceId: string, period: TechnicalHistoryPeriod) {
  const rows = await buildServiceTechnicalHistoryQuery(serviceId, technicalHistorySince(period));
  return rows.reverse().map((row) => ({
    checkedAt: row.checkedAt.toISOString(),
    success: row.success,
    statusCode: row.statusCode,
    latencyMs: row.latencyMs,
    errorCode: row.errorCode,
    checkType: row.checkType,
  }));
}
