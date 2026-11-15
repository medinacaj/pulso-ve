import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/lib/db/client';
import { checkRateLimit } from '../src/lib/security/rate-limit';
import { sendAccountActionEmail } from '../src/lib/auth/account-email';
import { signAccountAction } from '../src/lib/auth/account-security';
import { POST as register } from '../src/app/api/account/register/route';
import { POST as verify } from '../src/app/api/account/verify/route';
import { POST as reset } from '../src/app/api/account/reset/route';

vi.mock('../src/lib/db/client', () => ({
  db: { insert: vi.fn(), select: vi.fn(), update: vi.fn() },
}));
vi.mock('../src/lib/security/rate-limit', () => ({ checkRateLimit: vi.fn() }));
vi.mock('../src/lib/auth/account-email', () => ({ sendAccountActionEmail: vi.fn() }));

const origin = 'https://staging.example.org';
const secret = 'nWqe7HArFfYK6jXze5GJn7StLdd9s6WqKjRq9VH8e13KzD59uT8WcHM4';
const id = '00000000-0000-4000-8000-000000000001';
const email = 'verified@example.org';
const hash = '$2a$12$hashed-password-version';
const limited = vi.mocked(checkRateLimit);
const transport = vi.mocked(sendAccountActionEmail);
const insert = vi.mocked(db.insert);
const select = vi.mocked(db.select);
const update = vi.mocked(db.update);

function post(path: string, body: unknown, inputOrigin = origin) {
  return new Request(origin + path, {
    method: 'POST',
    headers: { origin: inputOrigin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function mockInsertion(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
  const values = vi.fn().mockReturnValue({ onConflictDoNothing });
  insert.mockReturnValue({ values } as never);
  return { returning, values };
}
function mockSelect(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  select.mockReturnValue({ from } as never);
}
function mockUpdate(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  update.mockReturnValue({ set } as never);
  return { set, returning };
}
beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('PUBLIC_ACCOUNTS_ENABLED', 'true');
  vi.stubEnv('SITE_URL', origin);
  vi.stubEnv('ACCOUNT_TOKEN_SECRET', secret);
  vi.stubEnv('RESEND_API_KEY', 're_012345678901234567890123');
  vi.stubEnv('ACCOUNT_MAIL_FROM', 'cuentas@example.org');
  vi.stubEnv('ADMIN_OWNER_EMAIL', 'owner@example.org');
  insert.mockReset();
  select.mockReset();
  update.mockReset();
  limited.mockReset();
  transport.mockReset();
  limited.mockResolvedValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 900000 });
  transport.mockResolvedValue(true);
});

describe('rutas de cuentas con protecciones en servidor', () => {
  it('bloquea registro cuando las cuentas están deshabilitadas o el origen es ajeno', async () => {
    vi.stubEnv('PUBLIC_ACCOUNTS_ENABLED', 'false');
    expect((await register(post('/api/account/register', {
      email, password: 'password-long-enough',
    }))).status).toBe(503);
    vi.stubEnv('PUBLIC_ACCOUNTS_ENABLED', 'true');
    expect((await register(post('/api/account/register', {
      email, password: 'password-long-enough',
    }, 'https://evil.example.org'))).status).toBe(403);
    expect(insert).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  it('registro es indistinguible para correo nuevo y existente; no activa cuenta al crear', async () => {
    mockInsertion([]);
    const body = { email, password: 'password-long-enough' };
    const duplicate = await register(post('/api/account/register', body));
    expect(duplicate.status).toBe(202);
    expect(transport).not.toHaveBeenCalled();
    const fresh = mockInsertion([{ id, email, passwordHash: hash }]);
    const created = await register(post('/api/account/register', body));
    expect(created.status).toBe(202);
    expect(await created.json()).toEqual(await duplicate.json());
    expect(fresh.values).toHaveBeenCalledWith(expect.objectContaining({
      email, role: 'user', status: 'pending',
    }));
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({ kind: 'verify_email', recipient: email }));
  });

  it('verificación solamente activa pending con token firmado y password versionado', async () => {
    const token = signAccountAction('verify_email', id, email, hash, secret);
    mockSelect([{ id, email, role: 'user', status: 'pending', passwordHash: hash }]);
    const updated = mockUpdate([{ id }]);
    const response = await verify(post('/api/account/verify', { token }));
    expect(response.status).toBe(200);
    expect(updated.set).toHaveBeenCalledWith({ status: 'active' });
    mockSelect([{ id, email, role: 'user', status: 'active', passwordHash: hash }]);
    update.mockClear();
    expect((await verify(post('/api/account/verify', { token }))).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('token de restablecimiento sólo permite cambio atómico una vez', async () => {
    const token = signAccountAction('reset_password', id, email, hash, secret);
    mockSelect([{ id, email, role: 'user', status: 'active', passwordHash: hash }]);
    const updated = mockUpdate([{ id }]);
    expect((await reset(post('/api/account/reset', {
      token, password: 'a-strong-updated-password-123',
    }))).status).toBe(200);
    expect(updated.set).toHaveBeenCalledWith({
      passwordHash: expect.any(String),
    });
    mockSelect([{ id, email, role: 'user', status: 'active', passwordHash: 'new-hash' }]);
    update.mockClear();
    expect((await reset(post('/api/account/reset', {
      token, password: 'a-strong-updated-password-123',
    }))).status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
