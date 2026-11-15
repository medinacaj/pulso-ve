import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../src/app/api/health/monitoring/route';
import { getMonitorReadinessCounts } from '../src/lib/queries/monitoring-readiness';

vi.mock('@/lib/queries/monitoring-readiness', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/queries/monitoring-readiness')>();
  return { ...actual, getMonitorReadinessCounts: vi.fn() };
});

const getCounts = vi.mocked(getMonitorReadinessCounts);

beforeEach(() => {
  vi.stubEnv('ENABLE_TECHNICAL_CHECKS', 'true');
  getCounts.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('GET /api/health/monitoring (operación real del colector)', () => {
  it('responde 503 y evita consultar la base si los sondeos están deshabilitados', async () => {
    vi.stubEnv('ENABLE_TECHNICAL_CHECKS', 'false');
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toMatchObject({
      component: 'technical_monitoring', status: 'disabled',
      configured: null, recentlyChecked: null,
    });
    expect(getCounts).not.toHaveBeenCalled();
  });

  it.each([
    [0, 0, 'not_configured', 503],
    [3, 0, 'stale', 503],
    [3, 2, 'stale', 503],
    [3, 3, 'ok', 200],
  ])('clasifica %i destinos y %i mediciones como %s (HTTP %i)',
    async (configured, recentlyChecked, expectedStatus, code) => {
      const last = new Date('2026-11-15T12:00:00.000Z');
      getCounts.mockResolvedValue({ configured, recentlyChecked, newestCheck: last });
      const response = await GET();
      const body = await response.json();
      expect(response.status).toBe(code);
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(body).toMatchObject({
        component: 'technical_monitoring',
        status: expectedStatus, configured, recentlyChecked,
        latestMeasurementAt: last.toISOString(), freshnessSeconds: 1800,
      });
      expect(Number.isNaN(Date.parse(body.checkedAt))).toBe(false);
      expect(JSON.stringify(body)).not.toContain('DATABASE_URL');
      expect(getCounts).toHaveBeenCalledTimes(1);
      expect(getCounts.mock.calls[0][0]).toBeInstanceOf(Date);
    },
  );

  it('devuelve 503 ante error PostgreSQL sin filtrar información interna', async () => {
    getCounts.mockRejectedValue(new Error('postgres://user:secret@db.internal/private'));
    const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await GET();
      const body = await response.json();
      expect(response.status).toBe(503);
      expect(body).toMatchObject({ component: 'technical_monitoring', status: 'unavailable' });
      expect(JSON.stringify(body)).not.toMatch(/db\.internal|secret|postgres:\/\//);
      expect(logger).toHaveBeenCalledWith('PulsoVE: no fue posible verificar frescura del monitoreo');
    } finally {
      logger.mockRestore();
    }
  });

  it('rechaza ventanas inválidas y permite una ventana explícita de cinco minutos', async () => {
    getCounts.mockResolvedValue({ configured: 1, recentlyChecked: 1, newestCheck: null });
    vi.stubEnv('MONITOR_FRESHNESS_SECONDS', '1');
    expect((await (await GET()).json()).freshnessSeconds).toBe(1800);
    vi.stubEnv('MONITOR_FRESHNESS_SECONDS', '300');
    expect((await (await GET()).json()).freshnessSeconds).toBe(300);
  });
});
