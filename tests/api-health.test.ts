import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/lib/db/client';
import { GET } from '../src/app/api/health/route';

vi.mock('../src/lib/db/client', () => ({
  db: { execute: vi.fn() },
}));

describe('GET /api/health (conectividad PostgreSQL)', () => {
  const execute = vi.mocked(db.execute);

  beforeEach(() => {
    execute.mockReset();
  });

  it('devuelve 200 sin caché solo después de una consulta SQL exitosa', async () => {
    execute.mockResolvedValue([] as never);

    const response = await GET();
    const body = await response.json();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(body).toMatchObject({ component: 'postgresql', status: 'ok' });
    expect(Number.isNaN(Date.parse(body.checkedAt))).toBe(false);
  });

  it('devuelve 503 sin filtrar errores internos cuando la base no responde', async () => {
    execute.mockRejectedValue(new Error('postgresql://user:secret@db.internal:5432/private'));
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toContain('no-store');
      expect(body).toMatchObject({ component: 'postgresql', status: 'unavailable' });
      expect(JSON.stringify(body)).not.toContain('secret');
      expect(JSON.stringify(body)).not.toContain('db.internal');
      expect(errorLog).toHaveBeenCalledWith('PulsoVE: no se pudo comprobar la conexión PostgreSQL');
    } finally {
      errorLog.mockRestore();
    }
  });
});
