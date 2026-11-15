'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export type AccountMode = 'register' | 'login' | 'recover' | 'resend' | 'verify' | 'reset';
const instructions: Record<AccountMode, { title: string; intro: string; button: string; url: string }> = {
  register: {
    title: 'Crear cuenta', intro: 'Recibirás un enlace para verificar tu correo antes de iniciar sesión.',
    button: 'Solicitar registro', url: '/api/account/register',
  },
  login: {
    title: 'Iniciar sesión', intro: 'Solo pueden acceder las cuentas que hayan verificado su correo.',
    button: 'Ingresar', url: '/api/account/login',
  },
  recover: {
    title: 'Recuperar acceso', intro: 'Si la cuenta existe y está verificada, recibirás un enlace de 15 minutos.',
    button: 'Enviar instrucciones', url: '/api/account/recover',
  },
  resend: {
    title: 'Reenviar verificación', intro: 'Si hay una cuenta pendiente, enviaremos otro enlace de verificación.',
    button: 'Solicitar reenvío', url: '/api/account/resend',
  },
  verify: {
    title: 'Verificar correo', intro: 'Confirma la verificación del correo asociado a tu cuenta PulsoVE.',
    button: 'Confirmar correo', url: '/api/account/verify',
  },
  reset: {
    title: 'Establecer nueva contraseña', intro: 'Cambia tu contraseña con el enlace privado recibido por correo.',
    button: 'Guardar nueva contraseña', url: '/api/account/reset',
  },
};

export function AccountForm({ mode, token = '' }: { mode: AccountMode; token?: string }) {
  const router = useRouter();
  const details = instructions[mode];
  const emailRequired = !['verify', 'reset'].includes(mode);
  const passwordRequired = ['register', 'login', 'reset'].includes(mode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if ((mode === 'register' || mode === 'reset') && password !== confirm) {
      setError('Las contraseñas deben coincidir.');
      return;
    }
    if ((mode === 'verify' || mode === 'reset') && !token) {
      setError('El enlace no incluye un token válido.');
      return;
    }
    setError('');
    setBusy(true);
    const payload = {
      ...(emailRequired ? { email } : {}),
      ...(passwordRequired ? { password } : {}),
      ...(mode === 'verify' || mode === 'reset' ? { token } : {}),
    };
    try {
      const response = await fetch(details.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('account_request_failed');
      setCompleted(true);
      setPassword('');
      setConfirm('');
      if (mode === 'login') {
        router.replace('/cuenta');
        router.refresh();
      }
    } catch {
      setError('No se pudo completar la operación. Comprueba los datos, el enlace o inténtalo más tarde.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-md px-4 py-12" aria-labelledby="account-title">
      <div className="rounded-xl border border-border bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Cuenta PulsoVE</p>
        <h1 id="account-title" className="mt-2 font-display text-2xl font-semibold">{details.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">{details.intro}</p>

        {completed ? (
          <div role="status" className="mt-6 rounded-lg border border-border bg-bg p-4 text-sm">
            <p>{mode === 'login' ? 'Inicio de sesión realizado.' :
              mode === 'verify' ? 'Correo verificado. Puedes iniciar sesión.' :
              mode === 'reset' ? 'Contraseña actualizada. Vuelve a ingresar.' :
              'Solicitud recibida. Si corresponde, recibirás instrucciones por correo.'}</p>
            <Link href={mode === 'login' ? '/cuenta' : '/cuenta/ingresar'}
              className="mt-3 inline-block font-semibold text-brand-600 underline underline-offset-2">
              {mode === 'login' ? 'Ver mi cuenta' : 'Ir a iniciar sesión'}
            </Link>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4">
            {emailRequired && (
              <div>
                <label htmlFor="account-email" className="block text-sm font-semibold">Correo electrónico</label>
                <input type="email" id="account-email" autoComplete="email" required maxLength={255}
                  value={email} onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 w-full rounded-md border border-border bg-bg px-3 py-3 text-sm" />
              </div>
            )}
            {passwordRequired && (
              <div>
                <label htmlFor="account-password" className="block text-sm font-semibold">
                  {mode === 'login' ? 'Contraseña' : 'Nueva contraseña (mínimo 12 caracteres)'}
                </label>
                <input id="account-password" type="password" required
                  minLength={mode === 'login' ? 1 : 12} maxLength={128}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password} onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 w-full rounded-md border border-border bg-bg px-3 py-3 text-sm" />
              </div>
            )}
            {(mode === 'register' || mode === 'reset') && (
              <div>
                <label htmlFor="account-confirm" className="block text-sm font-semibold">Confirmar contraseña</label>
                <input id="account-confirm" type="password" required minLength={12} maxLength={128}
                  autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)}
                  className="mt-2 w-full rounded-md border border-border bg-bg px-3 py-3 text-sm" />
              </div>
            )}
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={busy}
              className="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? 'Procesando…' : details.button}
            </button>
          </form>
        )}

        <nav aria-label="Opciones de cuenta" className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-xs text-brand-600">
          <Link href="/cuenta/ingresar" className="underline underline-offset-2">Ingresar</Link>
          <Link href="/cuenta/registrarse" className="underline underline-offset-2">Registrarse</Link>
          <Link href="/cuenta/recuperar" className="underline underline-offset-2">Olvidé mi contraseña</Link>
          <Link href="/cuenta/reenviar" className="underline underline-offset-2">Reenviar verificación</Link>
        </nav>
        <p className="mt-5 text-xs leading-relaxed text-ink-muted">
          El correo se usa para verificar y recuperar tu cuenta. No compartas enlaces de verificación
          ni contraseñas; si no solicitaste un mensaje, puedes ignorarlo.
        </p>
      </div>
    </section>
  );
}
