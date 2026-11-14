import { describe, expect, it } from 'vitest';
import {
  buildMonitorReadinessQuery,
  classifyMonitorReadiness,
} from '../src/lib/queries/monitoring-readiness';

describe('salud real del motor técnico', () => {
  it('nunca afirma estar operativo sin fuentes o datos recientes', () => {
    expect(classifyMonitorReadiness(false, 20, 20)).toBe('disabled');
    expect(classifyMonitorReadiness(true, 0, 0)).toBe('not_configured');
    expect(classifyMonitorReadiness(true, 3, 0)).toBe('stale');
    expect(classifyMonitorReadiness(true, 3, 2)).toBe('stale');
    expect(classifyMonitorReadiness(true, 3, 3)).toBe('ok');
  });

  it('solo cuenta endpoints verificados y su última medición real en PostgreSQL', () => {
    const q = buildMonitorReadinessQuery(new Date('2026-11-14T00:00:00.000Z')).toSQL();
    expect(q.sql).toContain('technical_checks');
    expect(q.sql).toContain('service_endpoints');
    expect(q.sql).toContain('is_demo');
    expect(q.sql).toContain('last_check');
    expect(q.sql).toContain('count(*) filter');
    expect(q.params).toContain(false);
    expect(q.params).toContain('https');
    expect(q.params.some((param) => String(param).includes('2026-11-14'))).toBe(true);
  });
});
