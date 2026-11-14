import { NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  isAdminWriteOriginAllowed,
  readAdminSettings,
} from '@/lib/auth/admin-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let settings;
  try {
    settings = readAdminSettings();
  } catch {
    return NextResponse.json({ error: { code: 'admin_disabled' } }, { status: 503 });
  }

  if (!isAdminWriteOriginAllowed(request, settings.siteOrigin)) {
    return NextResponse.json({ error: { code: 'forbidden' } }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  // Stateless sessions remain valid until expiry if stolen: this clears the
  // browser cookie only. Persistent revocation is a production blocker.
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  return response;
}
