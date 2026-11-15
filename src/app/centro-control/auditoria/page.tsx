import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthorizedAdmin } from '@/lib/auth/admin-session';
import { getRecentAuditEvents } from '@/lib/queries/admin-audit';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Registro de auditoría — Centro de Control',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-VE', {
    dateStyle: 'medium', timeStyle: 'medium', timeZone: 'America/Caracas',
  }).format(new Date(value));
}

export default async function AdminAuditPage() {
  const admin = await getAuthorizedAdmin();
  if (!admin) redirect('/centro-control/acceso');
  const events = await getRecentAuditEvents();

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <nav aria-label="Navegación administrativa" className="text-sm">
        <Link href="/centro-control" className="text-brand-600 underline underline-offset-2">
          Centro de Control
        </Link>
        <span className="px-2 text-ink-muted">/</span> Auditoría
      </nav>

      <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-ink-muted">
        Acceso restringido · {admin.email}
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold">Registro de auditoría</h1>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-muted">
        Eventos reales de auditoría guardados en PostgreSQL. Se muestran los 100 más recientes.
        No se exponen datos anteriores/posteriores de recursos, hashes de IP ni identificadores
        de terceros. Esta vista no representa una auditoría de seguridad exhaustiva.
      </p>

      {events.length === 0 ? (
        <p role="status" className="mt-8 rounded-lg border border-border bg-surface p-6 text-sm text-ink-muted">
          No hay eventos de auditoría registrados.
        </p>
      ) : (
        <div className="mt-8 w-full overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[580px] border-collapse text-left text-sm">
            <caption className="sr-only">Últimos eventos de auditoría del Centro de Control</caption>
            <thead className="bg-bg text-xs font-semibold text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-3">Fecha (Venezuela)</th>
                <th scope="col" className="px-4 py-3">Operación</th>
                <th scope="col" className="px-4 py-3">Recurso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                    <time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time>
                  </td>
                  <td className="break-words px-4 py-3 font-semibold">{event.action}</td>
                  <td className="break-words px-4 py-3">{event.entity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-5 text-xs text-ink-muted">
        Solo lectura. La retención, exportación, revisión de accesos y correlación con incidentes
        requieren controles adicionales antes de operar en producción.
      </p>
    </section>
  );
}
