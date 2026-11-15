import type { Metadata } from 'next';
import { AccountForm } from '@/components/account/AccountForm';

export const metadata: Metadata = {
  title: 'Restablecer contraseña',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// Credentials are client-side fragment values, never query strings or SSR props.
export default function AccountActionPage() {
  return <AccountForm mode="reset" />;
}
