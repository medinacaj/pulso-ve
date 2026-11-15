import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/lib/db/client';
import { getAuthorizedAdmin } from '../src/lib/auth/admin-session';
import { checkRateLimit } from '../src/lib/security/rate-limit';
import { POST } from '../src/app/api/admin/comments/[id]/moderate/route';

vi.mock('../src/lib/db/client', () => ({
  db: { transaction: vi.fn() },
}));
vi.mock('../src/lib/auth/admin-session', () => ({
  getAuthorizedAdmin: vi.fn(),
}));
vi.mock('../src/lib/security/rate-limit', () => ({
  checkRateLimit: vi.fn(),
}));

const adminId = '00000000-0000-4000-8000-000000000001';
const commentId = '00000000-0000-4000-8000-000000000002';
const origin = 'https://staging.example.org';
const context = { params: Promise.resolve({ id: commentId }) };
const transaction = vi.mocked(db.transaction);
const authorize = vi.mocked(getAuthorizedAdmin);
const limit = vi.mocked(checkRateLimit);

function request(body: unknown, requestOrigin = origin) {
  return new Request(origin + '/api/admin/comments/' + commentId + '/moderate', {
    method: 'POST',
    headers: { origin: requestOrigin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('ADMIN_ACCESS_ENABLED', 'true');
  vi.stubEnv('ADMIN_OWNER_EMAIL', 'owner@staging.example.org');
  vi.stubEnv('SITE_URL', origin);
  vi.stubEnv('JWT_SECRET', 'THIS_IS_A_FAKE_ONLY_JWT_KEY_OVER_FORTY_CHARACTERS_LONG');
  vi.stubEnv('ADMIN_TOTP_SECRET_BASE32', 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  transaction.mockReset();
  authorize.mockReset();
  limit.mockReset();
  authorize.mockResolvedValue({ id: adminId, email: 'owner@staging.example.org' });
  limit.mockResolvedValue({ allowed: true, limit: 60, remaining: 59, resetAt: Date.now() + 900_000 });
});

describe('POST de moderación segura y auditada', () => {
  it('bloquea orígenes externos y actores sin sesión MFA', async () => {
    expect((await POST(request({ action: 'approve' }, 'https://evil.example.org'), context)).status).toBe(403);
    authorize.mockResolvedValue(null);
    expect((await POST(request({ action: 'approve' }), context)).status).toBe(401);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rechaza motivos vacíos, acciones arbitrarias e IDs erróneos', async () => {
    expect((await POST(request({ action: 'reject', reason: 'no' }), context)).status).toBe(400);
    expect((await POST(request({ action: 'delete_everything' }), context)).status).toBe(400);
    expect((await POST(request({ action: 'approve' }), { params: Promise.resolve({ id: 'invalid' }) })).status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('actualiza pending y registra auditoría en la misma transacción', async () => {
    const audit = vi.fn().mockResolvedValue([]);
    const values = vi.fn().mockReturnValue(Promise.resolve([]));
    const returning = vi.fn().mockResolvedValue([{ id: commentId }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const tx = {
      update: vi.fn().mockReturnValue({ set }),
      insert: vi.fn().mockReturnValue({ values }),
    };
    // Verify audit log payload as part of the transaction.
    values.mockImplementation((data) => {
      audit(data);
      return Promise.resolve([]);
    });
    transaction.mockImplementation(async (fn) => fn(tx as never));

    const response = await POST(request({ action: 'reject', reason: 'Contenido fuera de tema' }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { id: commentId, status: 'rejected' } });
    expect(returning).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({
      userId: adminId,
      action: 'comment_rejected',
      entity: 'service_comments',
      entityId: commentId,
    }));
  });

  it('no audita ni aprueba un comentario que ya no está pendiente', async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const tx = { update: vi.fn().mockReturnValue({ set }), insert: vi.fn() };
    transaction.mockImplementation(async (fn) => fn(tx as never));
    const response = await POST(request({ action: 'approve' }), context);
    expect(response.status).toBe(409);
    expect(tx.insert).not.toHaveBeenCalled();
  });
});
