import type { Metadata } from 'next';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';

export const metadata: Metadata = {
  title: 'Acceso al Centro de Control',
  robots: { index: false, follow: false },
};

export default function AdminAccessPage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-16">
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Acceso restringido</p>
        <h1 className="mt-2 font-display text-2xl font-semibold">Centro de Control</h1>
        <p className="mt-3 text-sm text-ink-muted">
          Acceso exclusivo del administrador provisionado. Requiere contraseña y TOTP.
          El panel permanece deshabilitado hasta configurar los controles de seguridad.
        </p>
        <AdminLoginForm />
      </div>
    </main>
  );
}
