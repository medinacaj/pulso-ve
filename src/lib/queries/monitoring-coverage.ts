import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { services, serviceEndpoints, technicalChecks } from '@/lib/db/schema';

/**
 * Cobertura observada, NO cobertura contratada ni disponibilidad confirmada.
 *
 * Cuenta servicios activos no demostrativos que tienen al menos una medición
 * técnica persistida en PostgreSQL durante el período. Evita confundir las
 * fichas del catálogo (incluidas las candidatas no verificadas) con servicios
 * efectivamente comprobados. No interpreta el resultado de las mediciones.
 */
export function buildRecentTechnicalCoverageQuery(since: Date) {
  return db
    .select({ count: sql<number>`count(distinct ${services.id})::int` })
    .from(services)
    .innerJoin(serviceEndpoints, eq(serviceEndpoints.serviceId, services.id))
    .innerJoin(technicalChecks, eq(technicalChecks.serviceEndpointId, serviceEndpoints.id))
    .where(
      and(
        eq(services.active, true),
        eq(services.isDemo, false),
        gte(technicalChecks.checkedAt, since),
      ),
    );
}

export async function countRecentTechnicalCoverage(since: Date): Promise<number> {
  const [row] = await buildRecentTechnicalCoverageQuery(since);
  return row?.count ?? 0;
}
