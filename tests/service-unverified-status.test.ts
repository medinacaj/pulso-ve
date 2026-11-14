import { describe, expect, it } from 'vitest';
import { unverifiedStatusFromWindow } from '../src/lib/queries/status';

describe('estado no confirmado por datos independientes', () => {
  it('sin ventana conserva estado desconocido y no finge disponibilidad', () => {
    expect(unverifiedStatusFromWindow(undefined)).toMatchObject({
      status: 'insufficient_data',
      confidence: null,
      since: null,
      lastUpdated: null,
      officiallyConfirmed: false,
    });
  });

  it('una ventana procesada no equivale a servicio normal, aun sin reportes', () => {
    const windowStart = new Date('2026-11-14T12:00:00.000Z');
    const createdAt = new Date('2026-11-14T12:01:00.000Z');
    const state = unverifiedStatusFromWindow({ windowStart, createdAt });

    expect(state.status).toBe('insufficient_data');
    expect(state.confidence).toBeNull();
    expect(state.officiallyConfirmed).toBe(false);
    expect(state.since).toEqual(windowStart);
    expect(state.lastUpdated).toEqual(createdAt);
  });
});
