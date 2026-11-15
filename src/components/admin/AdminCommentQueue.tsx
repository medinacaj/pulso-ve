'use client';

import { useState } from 'react';
import Link from 'next/link';

type PendingComment = {
  id: string;
  serviceSlug: string;
  serviceName: string;
  body: string;
  createdAt: string;
};

function formatTimestamp(iso: string) {
  return new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function AdminCommentQueue({ initial }: { initial: PendingComment[] }) {
  const [pending, setPending] = useState(initial);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [handled, setHandled] = useState(0);

  async function moderate(id: string, action: 'approve' | 'reject') {
    if (processing) return;
    const reason = reasons[id]?.trim() ?? '';
    if (action === 'reject' && (reason.length < 5 || reason.length > 240)) {
      setError('Escribe un motivo de rechazo de 5 a 240 caracteres.');
      return;
    }
    setProcessing(id);
    setError('');
    try {
      const response = await fetch('/api/admin/comments/' + encodeURIComponent(id) + '/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
        body: JSON.stringify(action === 'approve' ? { action } : { action, reason }),
      });
      if (!response.ok) throw Error('moderation_failed');
      setPending((current) => current.filter((item) => item.id !== id));
      setHandled((current) => current + 1);
    } catch {
      setError('La acción no pudo registrarse. Recarga la página para verificar el estado.');
    } finally {
      setProcessing(null);
    }
  }

  return (
    <section aria-labelledby="pending-comments-title" className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="pending-comments-title" className="font-display text-lg font-semibold">Cola pendiente</h2>
        <span className="rounded-lg border border-border px-3 py-2 text-xs text-ink-muted">
          {pending.length} mostrados · {handled} resueltos en esta sesión
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-muted">
        Los comentarios no son visibles al público hasta ser aprobados. Máximo 50 por carga;
        recarga la página para obtener los siguientes. La aprobación/rechazo queda auditada.
      </p>
      {error && <p role="alert" className="mt-4 rounded-md border border-red-300 p-3 text-sm text-red-700">{error}</p>}
      {pending.length === 0 ? (
        <p role="status" className="mt-5 rounded-lg border border-border p-6 text-sm text-ink-muted">
          No hay comentarios pendientes dentro de los resultados cargados.
        </p>
      ) : (
        <ul className="mt-5 space-y-4">
          {pending.map((item) => (
            <li key={item.id} className="min-w-0 rounded-xl border border-border bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
                <Link href={'/servicios/' + encodeURIComponent(item.serviceSlug)}
                  className="font-semibold text-brand-600 underline-offset-2 hover:underline">
                  {item.serviceName}
                </Link>
                <time dateTime={item.createdAt}>{formatTimestamp(item.createdAt)}</time>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-bg p-3 text-sm leading-relaxed">
                {item.body}
              </p>
              <label htmlFor={'moderation-reason-' + item.id}
                className="mt-4 block text-xs font-semibold text-ink-muted">
                Motivo de rechazo (requerido solo para rechazar)
              </label>
              <textarea id={'moderation-reason-' + item.id} maxLength={240} rows={2}
                value={reasons[item.id] ?? ''}
                onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))}
                className="mt-2 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
                placeholder="Motivo de la decisión para el registro de auditoría" />
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={processing !== null}
                  onClick={() => void moderate(item.id, 'approve')}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  Aprobar comentario
                </button>
                <button type="button" disabled={processing !== null}
                  onClick={() => void moderate(item.id, 'reject')}
                  className="rounded-lg border border-red-500 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">
                  Rechazar y registrar motivo
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
