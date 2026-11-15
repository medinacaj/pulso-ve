import type { Metadata } from 'next';
import { AccountForm } from '@/components/account/AccountForm';

export const metadata: Metadata = {
  title: 'Recuperar cuenta',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function AccountPage() {
  return <AccountForm mode="recover" />;
}
