'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AdminLogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/admin/logout', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) throw Error('logout_failed');
      router.replace('/centro-control/acceso');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" disabled={busy} onClick={() => void signOut().catch(() => setBusy(false))}
      className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-bg disabled:opacity-50">
      Cerrar sesión
    </button>
  );
}
