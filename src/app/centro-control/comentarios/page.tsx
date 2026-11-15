import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthorizedAdmin } from '@/lib/auth/admin-session';
import { getPendingCommentsQueue } from '@/lib/queries/admin-comments';
import { AdminCommentQueue } from '@/components/admin/AdminCommentQueue';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Moderación de comentarios — Centro de Control',
  robots: { index: false, follow: false },
};

export default async function AdminCommentsPage() {
  const admin = await getAuthorizedAdmin();
  if (!admin) redirect('/centro-control/acceso');
  const comments = await getPendingCommentsQueue();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <nav aria-label="Navegación administrativa" className="text-sm">
        <Link href="/centro-control" className="text-brand-600 underline underline-offset-2">
          Centro de Control
        </Link>
        <span className="px-2 text-ink-muted">/</span>
        Moderación
      </nav>
      <header className="mt-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Administrador autenticado · {admin.email}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold">Moderar comentarios</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-muted">
          Revisión de opiniones comunitarias con registro de decisiones en PostgreSQL.
          No modifica reportes ciudadanos ni estados técnicos de plataformas.
        </p>
      </header>
      <AdminCommentQueue initial={comments} />
    </div>
  );
}
