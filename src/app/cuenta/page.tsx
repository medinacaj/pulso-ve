import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSignedInUser } from '@/lib/auth/account-session';
import { AccountLogoutButton } from '@/components/account/AccountLogoutButton';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Mi cuenta',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function MyAccountPage() {
  const user = await getSignedInUser();
  if (!user) redirect('/cuenta/ingresar');
  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-12">
      <div className="rounded-xl border border-border bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Cuenta verificada</p>
        <h1 className="mt-2 font-display text-2xl font-semibold">Mi cuenta PulsoVE</h1>
        <dl className="my-6 rounded-lg bg-bg p-4 text-sm">
          <dt className="font-semibold">Correo de la cuenta</dt>
          <dd className="mt-1 break-all text-ink-muted">{user.email}</dd>
        </dl>
        <p className="mb-6 text-sm leading-relaxed text-ink-muted">
          Sesión verificada contra PostgreSQL. No hay suscripciones ni preferencias
          configuradas automáticamente. Recuperar contraseña por correo invalida esta sesión.
        </p>
        <AccountLogoutButton />
      </div>
    </section>
  );
}
