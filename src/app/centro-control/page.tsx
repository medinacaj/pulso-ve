import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, eq, gte, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { services, incidents, reports, technicalChecks, serviceComments } from '@/lib/db/schema';
import { getAuthorizedAdmin } from '@/lib/auth/admin-session';
import { AdminLogoutButton } from '@/components/admin/AdminLogoutButton';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Centro de Control administrativo',
  robots: { index: false, follow: false },
};

export default async function AdminDashboardPage() {
  const admin = await getAuthorizedAdmin();
  if (!admin) redirect('/centro-control/acceso');

  const since24h = new Date(Date.now() - 24 * 60 * 60_000);
  const [activeServices, verifiedServices, openIncidents, reports24h, checks24h, pendingComments] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(services).where(eq(services.active, true)),
    db.select({ n: sql<number>`count(*)::int` }).from(services).where(and(eq(services.active, true), eq(services.isDemo, false))),
    db.select({ n: sql<number>`count(*)::int` }).from(incidents).where(ne(incidents.status, 'resolved')),
    db.select({ n: sql<number>`count(*)::int` }).from(reports).where(gte(reports.createdAt, since24h)),
    db.select({ n: sql<number>`count(*)::int` }).from(technicalChecks).where(gte(technicalChecks.checkedAt, since24h)),
    db.select({ n: sql<number>`count(*)::int` }).from(serviceComments).where(eq(serviceComments.moderationStatus, 'pending')),
  ]);

  const values = [
    { label: 'Fichas activas en catálogo', value: activeServices[0]?.n ?? 0 },
    { label: 'Servicios revisados (no demo)', value: verifiedServices[0]?.n ?? 0 },
    { label: 'Incidentes no resueltos', value: openIncidents[0]?.n ?? 0 },
    { label: 'Reportes de las últimas 24 horas', value: reports24h[0]?.n ?? 0 },
    { label: 'Comprobaciones técnicas en 24 horas', value: checks24h[0]?.n ?? 0 },
    { label: 'Comentarios pendientes de moderación', value: pendingComments[0]?.n ?? 0 },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Área protegida · MFA obligatorio</p>
          <h1 className="mt-2 font-display text-3xl font-semibold">Centro de Control</h1>
          <p className="mt-2 text-sm text-ink-muted">Sesión de {admin.email} · consulta exclusiva a PostgreSQL.</p>
        </div>
        <AdminLogoutButton />
      </header>

      <section className="mt-8" aria-labelledby="admin-metrics-title">
        <h2 id="admin-metrics-title" className="font-display text-lg font-semibold">Indicadores registrados</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Valores obtenidos de la base de datos. No se simula cobertura ni disponibilidad.
        </p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {values.map((item) => (
            <div key={item.label} className="rounded-xl border border-border bg-surface p-5">
              <dt className="text-sm text-ink-muted">{item.label}</dt>
              <dd className="mt-3 font-mono text-3xl font-semibold tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-8 rounded-xl border border-border bg-surface p-5" aria-labelledby="admin-tools-title">
        <h2 id="admin-tools-title" className="font-display text-lg font-semibold">Módulos disponibles</h2>
        <div className="mt-4">
          <Link href="/centro-control/comentarios"
            className="inline-flex items-center rounded-lg border border-brand-600 px-4 py-3 text-sm font-semibold text-brand-600 hover:bg-bg">
            Moderar comentarios ({pendingComments[0]?.n ?? 0} pendientes)
          </Link>
        </div>
      </section>

      <p className="mt-8 rounded-lg border border-border bg-bg p-4 text-sm text-ink-muted">
        Gestión de plataformas, cuentas, incidentes, fuentes y notificaciones
        sigue pendiente de endpoints RBAC y pruebas específicas. Este panel no simula esas acciones.
      </p>
    </div>
  );
}
