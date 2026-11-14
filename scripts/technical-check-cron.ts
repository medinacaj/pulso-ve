/**
 * One-shot, opt-in HTTPS monitor.
 * Disabled by default; no daemon, no scraping, no inferred provider status.
 */
import 'dotenv/config';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { services, serviceEndpoints, technicalChecks } from '../src/lib/db/schema';
import { isTechnicalCheckDue, probeHttpsEndpoint, UnsafeMonitorTarget } from '../src/lib/monitoring/https-probe';

function maxChecks(): number {
  const raw = Number(process.env.TECHNICAL_MAX_CHECKS_PER_RUN ?? 10);
  return Number.isInteger(raw) && raw >= 1 && raw <= 20 ? raw : 10;
}

async function run() {
  if (process.env.ENABLE_TECHNICAL_CHECKS !== 'true') {
    console.log('Sondeos técnicos deshabilitados. No se realizó ninguna solicitud.');
    return;
  }

  // Load DB only when explicitly enabled.
  const { db } = await import('../src/lib/db/client');
  const latest = db
    .select({
      endpointId: technicalChecks.serviceEndpointId,
      lastCheckedAt: sql<Date>`max(${technicalChecks.checkedAt})`.as('last_checked_at'),
    })
    .from(technicalChecks)
    .groupBy(technicalChecks.serviceEndpointId)
    .as('latest_technical_check');

  const endpoints = await db
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

  const now = new Date();
  let probed = 0;
  let persisted = 0;
  let failed = 0;
  let unsafe = 0;

  for (const endpoint of endpoints) {
    if (probed >= maxChecks()) break;
    const last = endpoint.lastCheckedAt ? new Date(endpoint.lastCheckedAt) : null;
    if (!isTechnicalCheckDue(last, endpoint.frequencySeconds, now)) continue;

    let result;
    try {
      result = await probeHttpsEndpoint(endpoint.target, endpoint.timeoutMs);
    } catch (error) {
      // Configuration/DNS rejection is not evidence of service outage.
      if (error instanceof UnsafeMonitorTarget) {
        unsafe++;
        console.error('Sondeo omitido por destino o DNS no permitido: ' + error.reason);
        continue;
      }
      throw error;
    }
    probed++;

    // Serialize writes for an endpoint across concurrent cron invocations.
    // Concurrent workers may both probe, but only one may persist per window.
    const inserted = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${endpoint.id})::bigint)`);
      const [latestSaved] = await tx
        .select({ checkedAt: technicalChecks.checkedAt })
        .from(technicalChecks)
        .where(eq(technicalChecks.serviceEndpointId, endpoint.id))
        .orderBy(desc(technicalChecks.checkedAt))
        .limit(1);

      if (!isTechnicalCheckDue(latestSaved?.checkedAt ?? null, endpoint.frequencySeconds, new Date())) {
        return false;
      }

      await tx.insert(technicalChecks).values({
        serviceEndpointId: endpoint.id,
        checkType: 'https',
        success: result.success,
        latencyMs: result.latencyMs,
        statusCode: result.statusCode,
        errorCode: result.errorCode,
        checkedAt: new Date(),
        metadata: { source: 'https_head', redirectsFollowed: false, httpMethod: 'HEAD' },
      });
      return true;
    });

    if (inserted) {
      persisted++;
      if (!result.success) failed++;
    }
  }

  console.log(JSON.stringify({
    enabled: true,
    candidates: endpoints.length,
    probed,
    persisted,
    failed,
    unsafeSkipped: unsafe,
    timestamp: new Date().toISOString(),
  }));
}

run().then(
  () => process.exit(0),
  () => {
    console.error('Ciclo de sondeo falló. Consultar registros privados del servidor.');
    process.exit(1);
  },
);
