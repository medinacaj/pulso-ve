'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function AccountLogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function logout() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/account/logout', {
        method: 'POST', cache: 'no-store', credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('logout_failed');
      router.replace('/cuenta/ingresar');
      router.refresh();
    } catch {
      setError('No fue posible cerrar sesión. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button type="button" disabled={busy} onClick={() => void logout()}
        className="rounded-lg border border-border px-4 py-3 text-sm font-semibold disabled:opacity-50">
        {busy ? 'Cerrando sesión…' : 'Cerrar sesión'}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
