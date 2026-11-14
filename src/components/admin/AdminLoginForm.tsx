'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ email, password, otp }),
      });
      if (!response.ok) throw Error('login_failed');
      setPassword('');
      setOtp('');
      router.replace('/centro-control');
      router.refresh();
    } catch {
      setError('No fue posible acceder. Revisa credenciales, segundo factor y configuración.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void signIn(event)} className="mt-6 space-y-4">
      <div>
        <label htmlFor="admin-email" className="block text-sm font-semibold">Correo administrativo</label>
        <input id="admin-email" autoComplete="username" type="email" required maxLength={255}
          value={email} onChange={(event) => setEmail(event.target.value)}
          className="mt-2 w-full rounded-md border border-border bg-bg px-3 py-3 text-sm" />
      </div>
      <div>
        <label htmlFor="admin-password" className="block text-sm font-semibold">Contraseña</label>
        <input id="admin-password" autoComplete="current-password" type="password" required
          value={password} onChange={(event) => setPassword(event.target.value)}
          className="mt-2 w-full rounded-md border border-border bg-bg px-3 py-3 text-sm" />
      </div>
      <div>
        <label htmlFor="admin-otp" className="block text-sm font-semibold">Código de autenticación (6 dígitos)</label>
        <input id="admin-otp" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}"
          maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value)}
          className="mt-2 w-full rounded-md border border-border bg-bg px-3 py-3 font-mono text-sm tracking-widest" />
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={busy}
        className="w-full rounded-md bg-brand-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
        {busy ? 'Validando…' : 'Acceder con MFA'}
      </button>
    </form>
  );
}
