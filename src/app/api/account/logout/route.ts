import { NextResponse } from 'next/server';
import { USER_SESSION_COOKIE } from '@/lib/auth/account-security';
import { guardAccountWrite } from '@/lib/auth/account-request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const guard = guardAccountWrite(request);
  if (!guard.allowed) return guard.response;
  const response = NextResponse.json({ status: 'signed_out' }, {
    headers: { 'Cache-Control': 'no-store' },
  });
  response.cookies.set({
    name: USER_SESSION_COOKIE, value: '', maxAge: 0,
    httpOnly: true, secure: true, sameSite: 'strict', path: '/',
  });
  return response;
}
