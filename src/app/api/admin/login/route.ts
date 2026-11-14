import { createHmac } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { getClientIp } from '@/lib/privacy';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSession,
  isAdminWriteOriginAllowed,
  readAdminSettings,
  verifyAdminTotp,
} from '@/lib/auth/admin-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const loginSchema = z.object({
  email: z.email().max(255),
  password: z.string().min(1).max(128),
  otp: z.string().regex(/^\d{6}$/),
});

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

function failure(status: number, message: string) {
  return NextResponse.json({ error: { code: 'admin_access_denied', message } }, { status, headers });
}

export async function POST(request: Request) {
  let settings;
  try {
    settings = readAdminSettings();
  } catch {
    return failure(503, 'Acceso administrativo no habilitado');
  }
  if (!isAdminWriteOriginAllowed(request, settings.siteOrigin)) {
    return failure(403, 'Origen no autorizado');
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return failure(400, 'Solicitud inválida');
  }
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return failure(400, 'Solicitud inválida');
  const email = parsed.data.email.trim().toLowerCase();
  if (email !== settings.adminEmail) return failure(401, 'Credenciales o código inválidos');

  // HMAC keys are not raw emails or IP addresses in Redis/logs.
  const hashKey = (value: string) => createHmac('sha256', settings.jwtSecret).update(value).digest('hex');
  try {
    const emailLimit = await checkRateLimit('admin:email:' + hashKey(email), 5, 900);
    const ip = getClientIp(request);
    const ipLimit = ip === '0.0.0.0'
      ? { allowed: true }
      : await checkRateLimit('admin:network:' + hashKey(ip), 30, 900);
    if (!emailLimit.allowed || !ipLimit.allowed) {
      return failure(429, 'Demasiados intentos. Intenta más tarde.');
    }

    const [admin] = await db
      .select({
        id: users.id,
        role: users.role,
        status: users.status,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    const passwordValid = admin ? await bcrypt.compare(parsed.data.password, admin.passwordHash) : false;
    const otpValid = verifyAdminTotp(settings.totpSecret, parsed.data.otp);
    if (!admin || !passwordValid || !otpValid ||
        admin.role !== 'admin' || admin.status !== 'active') {
      return failure(401, 'Credenciales o código inválidos');
    }

    const session = createAdminSession(admin.id, admin.passwordHash, settings.jwtSecret);
    const response = NextResponse.json({ ok: true }, { headers });
    response.cookies.set({
      name: ADMIN_SESSION_COOKIE,
      value: session,
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/',
      maxAge: ADMIN_SESSION_TTL_SECONDS,
    });
    return response;
  } catch {
    console.error('PulsoVE: error interno en autenticación administrativa');
    return failure(503, 'Acceso administrativo temporalmente no disponible');
  }
}
