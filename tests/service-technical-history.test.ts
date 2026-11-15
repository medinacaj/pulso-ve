import { describe, expect, it } from 'vitest';
import {
  buildServiceTechnicalHistoryQuery,
  parseTechnicalHistoryPeriod,
  technicalHistorySince,
} from '../src/lib/queries/service-technical-history';

describe('histórico técnico verificable y API de rangos', () => {
  it('acepta solo los tres periodos declarados sin interpretar propiedades heredadas', () => {
    expect(parseTechnicalHistoryPeriod(null)).toBe('24h');
    for (const range of ['24h', '7d', '30d']) {
      expect(parseTechnicalHistoryPeriod(range)).toBe(range);
    }
    expect(parseTechnicalHistoryPeriod('365d')).toBeNull();
    expect(parseTechnicalHistoryPeriod('__proto__')).toBeNull();
    expect(parseTechnicalHistoryPeriod('')).toBeNull();
  });

  it('calcula límites temporales reales según UTC, no puntos sintéticos', () => {
    const now = new Date('2026-11-14T12:00:00.000Z');
    expect(technicalHistorySince('24h', now).toISOString()).toBe('2026-11-13T12:00:00.000Z');
    expect(technicalHistorySince('7d', now).toISOString()).toBe('2026-11-07T12:00:00.000Z');
    expect(technicalHistorySince('30d', now).toISOString()).toBe('2026-10-15T12:00:00.000Z');
  });

  it('consulta solo mediciones HTTPS observadas sin revelar la dirección del endpoint ni datos ciudadanos', () => {
    const query = buildServiceTechnicalHistoryQuery(
      '00000000-0000-0000-0000-000000000001',
      new Date('2026-11-14T00:00:00.000Z'),
      10000,
    ).toSQL();

    expect(query.sql).toContain('technical_checks');
    expect(query.sql).toContain('service_endpoints');
    expect(query.sql).toContain('checked_at');
    expect(query.sql).toContain('latency_ms');
    expect(query.sql).toContain('status_code');
    expect(query.sql).not.toContain('target');
    expect(query.sql).not.toContain('metadata');
    expect(query.sql).not.toContain('anonymous_hash');
    expect(query.sql.toLowerCase()).toContain('limit');
    expect(query.params).toContain(200);
    expect(query.params).toContain('https');
  });
});

import { parseTechnicalHistoryPoints } from '../src/lib/queries/technical-history-points';

describe('mediciones técnicas JSON no confiables', () => {
  const valid = {
    checkedAt: '2026-11-15T10:00:00.000Z',
    success: true, statusCode: 200, latencyMs: 123, errorCode: null, checkType: 'https',
  };
  it('conserva únicamente puntos HTTPS con fecha y latencia reales', () => {
    expect(parseTechnicalHistoryPoints([valid])).toEqual([valid]);
    expect(parseTechnicalHistoryPoints([])).toEqual([]);
    expect(parseTechnicalHistoryPoints([{ ...valid, privateEndpoint: 'https://internal.test', token: 'secret' }]))
      .toEqual([valid]);
  });
  it('rechaza lotes enormes, fechas imposibles y métricas inconsistentes', () => {
    for (const input of [
      null, {}, [null], Array(201).fill(valid),
      [{ ...valid, checkedAt: 'fecha inválida' }],
      [{ ...valid, checkedAt: '2026-02-30T00:00:00.000Z' }],
      [{ ...valid, checkedAt: '2026-11-15T10:00:00' }],
      [{ ...valid, success: 'true' }],
      [{ ...valid, latencyMs: -1 }],
      [{ ...valid, latencyMs: Infinity }],
      [{ ...valid, latencyMs: '42' }],
      [{ ...valid, statusCode: 999 }],
      [{ ...valid, statusCode: 200.5 }],
      [{ ...valid, checkType: 'unknown' }],
    ]) {
      expect(parseTechnicalHistoryPoints(input)).toBeNull();
    }
  });
});
