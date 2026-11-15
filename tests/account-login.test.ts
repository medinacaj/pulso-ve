import { beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { db } from '../src/lib/db/client';
import { checkRateLimit } from '../src/lib/security/rate-limit';
import { POST as login } from '../src/app/api/account/login/route';
import { POST as logout } from '../src/app/api/account/logout/route';

vi.mock('../src/lib/db/client', () => ({ db: { select: vi.fn() } }));
vi.mock('../src/lib/security/rate-limit', () => ({ checkRateLimit: vi.fn() }));
vi.mock('bcryptjs', () => ({
  default: { compare: vi.fn(), hash: vi.fn() },
}));

const origin = 'https://staging.example.org';
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'verified@example.org',
  role: 'user',
  status: 'active',
  passwordHash: 'a-protected-bcrypt-hash',
};
const select = vi.mocked(db.select);
const limit = vi.mocked(checkRateLimit);
const compare = vi.mocked(bcrypt.compare);
const hash = vi.mocked(bcrypt.hash);

function request(body: unknown, requestOrigin = origin) {
  return new Request(origin + '/api/account/login', {
    method: 'POST',
    headers: { origin: requestOrigin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function mockUser(rows: unknown[]) {
  const lim = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit: lim });
  const from = vi.fn().mockReturnValue({ where });
  select.mockReturnValue({ from } as never);
}
beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('PUBLIC_ACCOUNTS_ENABLED', 'true');
  vi.stubEnv('SITE_URL', origin);
  vi.stubEnv('ACCOUNT_TOKEN_SECRET', 'nWqe7HArFfYK6jXze5GJn7StLdd9s6WqKjRq9VH8e13KzD59uT8WcHM4');
  vi.stubEnv('RESEND_API_KEY', 're_012345678901234567890123');
  vi.stubEnv('ACCOUNT_MAIL_FROM', 'cuentas@example.org');
  select.mockReset();
  limit.mockReset();
  compare.mockReset();
  hash.mockReset();
  limit.mockResolvedValue({ allowed: true, limit: 8, remaining: 7, resetAt: Date.now() + 900000 });
  compare.mockResolvedValue(true as never);
  hash.mockResolvedValue('dummy-fixed-hash' as never);
});

describe('sesiones ciudadanas aisladas del Centro de Control', () => {
  it('prohíbe login desde origen externo y cuando la característica está apagada', async () => {
    const body = { email: user.email, password: 'example-password' };
    expect((await login(request(body, 'https://attacker.example.org'))).status).toBe(403);
    vi.stubEnv('PUBLIC_ACCOUNTS_ENABLED', 'false');
    expect((await login(request(body))).status).toBe(503);
    expect(select).not.toHaveBeenCalled();
  });

  it('impide acceso de usuario pendiente y cuenta administradora aun con contraseña correcta', async () => {
    for (const row of [{ ...user, status: 'pending' }, { ...user, role: 'admin' }]) {
      mockUser([row]);
      expect((await login(request({ email: user.email, password: 'example-password' }))).status).toBe(401);
    }
  });

  it('emite cookie segura solo para usuario verificado, activo y autenticado', async () => {
    mockUser([user]);
    const response = await login(request({ email: user.email, password: 'example-password' }));
    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('pulsove_user_session=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie.toLowerCase()).toContain('samesite=strict');
    expect(cookie).not.toContain(user.email);
  });

  it('no revela si existe cuenta y ejecuta bcrypt incluso si la búsqueda falla', async () => {
    mockUser([]);
    compare.mockResolvedValue(false as never);
    expect((await login(request({ email: user.email, password: 'wrong-password' }))).status).toBe(401);
    expect(compare).toHaveBeenCalled();
  });

  it('rechaza cuerpos enormes sin Content-Length antes de consultar la base', async () => {
    const oversized = request({ email: user.email, password: 'secret', padding: 'x'.repeat(10_000) });
    oversized.headers.delete('content-length');
    expect((await login(oversized)).status).toBe(400);
    expect(select).not.toHaveBeenCalled();
    expect(compare).not.toHaveBeenCalled();
  });

  it('logout solo borra la cookie si el origen es auténtico', async () => {
    const req = (requestOrigin: string) => new Request(origin + '/api/account/logout', {
      method: 'POST', headers: { origin: requestOrigin },
    });
    expect((await logout(req('https://attacker.example.org'))).status).toBe(403);
    const response = await logout(req(origin));
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
