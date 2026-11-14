import { describe, expect, it } from 'vitest';
import { buildRecentTechnicalCoverageQuery } from '../src/lib/queries/monitoring-coverage';

describe('cobertura de mediciones técnicas reales', () => {
  it('consulta pruebas técnicas persistidas y excluye fichas demostrativas', () => {
    const since = new Date('2026-11-14T00:00:00.000Z');
    const query = buildRecentTechnicalCoverageQuery(since).toSQL();

    expect(query.sql).toContain('count(distinct');
    expect(query.sql).toContain('technical_checks');
    expect(query.sql).toContain('service_endpoints');
    expect(query.sql).toContain('is_demo');
    expect(query.sql).toContain('checked_at');
    expect(query.params).toContain(false);
    expect(query.params.some((value) => typeof value === 'string' && value.includes('2026-11-14'))).toBe(true);
  });
});
