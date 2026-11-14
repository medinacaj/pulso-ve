import {
  classifyMonitorReadiness,
  getMonitorReadinessCounts,
} from '@/lib/queries/monitoring-readiness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

function json(status: string, data: Record<string, unknown>, code: number) {
  return Response.json({ component: 'technical_monitoring', status, ...data }, { status: code, headers });
}

/**
 * Operational readiness of scheduled measurements, not an uptime or
 * provider-outage signal. Report 503 whenever execution cannot be evidenced.
 */
export async function GET(): Promise<Response> {
  const checkedAt = new Date().toISOString();
  if (process.env.ENABLE_TECHNICAL_CHECKS !== 'true') {
    return json('disabled', { checkedAt, configured: null, recentlyChecked: null }, 503);
  }

  const configuredSeconds = Number(process.env.MONITOR_FRESHNESS_SECONDS ?? 1800);
  const freshnessSeconds = Number.isInteger(configuredSeconds) &&
    configuredSeconds >= 300 && configuredSeconds <= 3600
    ? configuredSeconds
    : 1800;

  try {
    const counts = await getMonitorReadinessCounts(new Date(Date.now() - freshnessSeconds * 1000));
    const status = classifyMonitorReadiness(true, counts.configured, counts.recentlyChecked);
    return json(status, {
      checkedAt,
      configured: counts.configured,
      recentlyChecked: counts.recentlyChecked,
      latestMeasurementAt: counts.newestCheck,
      freshnessSeconds,
      scope: 'Endpoints HTTPS habilitados para servicios no demostrativos; no acredita disponibilidad del proveedor',
    }, status === 'ok' ? 200 : 503);
  } catch {
    console.error('PulsoVE: no fue posible verificar frescura del monitoreo');
    return json('unavailable', { checkedAt }, 503);
  }
}
