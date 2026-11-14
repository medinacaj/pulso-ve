import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { services, categories, reports, incidents } from '@/lib/db/schema';
import { ok, withErrorHandling } from '@/lib/api/respond';
import { countRecentTechnicalCoverage } from '@/lib/queries/monitoring-coverage';

/**
 * El brief (sección 6) exige que cada métrica declare fuente/período/si es
 * estimada. Aquí se hace a nivel de bloque (todo viene de una consulta en
 * vivo a Postgres) en vez de repetirlo por campo. Lo que NO es calculable
 * sin el motor de anomalías (disponibilidad estimada, tiempo medio de
 * recuperación, ranking de estabilidad) se lista en `meta.pendingMetrics`
 * en vez de devolverse como cero o como null silencioso — sección 28: no
 * inventar estadísticas.
 */
async function handleGET(_request: Request) {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    serviceCount,
    categoryCount,
    reportsAllTime,
    reportsLast24h,
    incidentsAllTime,
    incidentsOpen,
    reportsByCategory,
    mostActive24h,
    servicesWithRecentTechnicalChecks,
  ] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(services).where(eq(services.active, true)),
    db.select({ n: sql<number>`count(*)::int` }).from(categories),
    db.select({ n: sql<number>`count(*)::int` }).from(reports),
    db.select({ n: sql<number>`count(*)::int` }).from(reports).where(gte(reports.createdAt, since24h)),
    db.select({ n: sql<number>`count(*)::int` }).from(incidents),
    db.select({ n: sql<number>`count(*)::int` }).from(incidents).where(sql`${incidents.status} != 'resolved'`),
    db
      .select({
        category: categories.name,
        categorySlug: categories.slug,
        count: sql<number>`count(${reports.id})::int`,
      })
      .from(categories)
      .leftJoin(services, eq(services.categoryId, categories.id))
      .leftJoin(reports, eq(reports.serviceId, services.id))
      .groupBy(categories.id)
      .orderBy(desc(sql`count(${reports.id})`)),
    db
      .select({
        service: services.name,
        serviceSlug: services.slug,
        reportsLast24h: sql<number>`count(${reports.id})::int`,
      })
      .from(services)
      .leftJoin(reports, and(eq(reports.serviceId, services.id), gte(reports.createdAt, since24h)))
      .where(eq(services.active, true))
      .groupBy(services.id)
      .orderBy(desc(sql`count(${reports.id})`))
      .limit(10),
    countRecentTechnicalCoverage(since24h),
  ]);

  return ok(
    {
      totals: {
        services: serviceCount[0]?.n ?? 0,
        categories: categoryCount[0]?.n ?? 0,
        reportsAllTime: reportsAllTime[0]?.n ?? 0,
        reportsLast24h: reportsLast24h[0]?.n ?? 0,
        incidentsAllTime: incidentsAllTime[0]?.n ?? 0,
        incidentsOpen: incidentsOpen[0]?.n ?? 0,
        servicesWithRecentTechnicalChecks,
      },
      reportsByCategory,
      mostActiveServices24h: mostActive24h,
    },
    {
      generatedAt: new Date().toISOString(),
      source: 'Consulta en vivo a PostgreSQL',
      period: 'Totales históricos donde se indica; el resto, últimas 24h',
      estimated: false,
      technicalCoverageDefinition: 'Servicios activos no demostrativos con al menos una medición técnica registrada en las últimas 24 horas. No prueba disponibilidad ni monitoreo continuo.',
      pendingMetrics: {
        availabilityEstimate: 'Requiere el motor de anomalías (Etapa 3 del plan)',
        meanRecoveryTime: 'Requiere incidentes reales cerrados por el motor (Etapa 3)',
        stabilityRanking: 'Requiere historial suficiente de incidentes (Etapa 3/9)',
        providerComparison: 'Requiere datos operativos reales, no de demostración (sección 28 del brief)',
      },
    },
  );
}

export const GET = withErrorHandling(handleGET);
