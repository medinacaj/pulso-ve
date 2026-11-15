import type { Metadata } from 'next';
import { AccountForm } from '@/components/account/AccountForm';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Restablecer contraseña',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function AccountActionPage({
  searchParams,
}: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  const validShape = token.length >= 30 && token.length <= 4096;
  return <AccountForm mode="reset" token={validShape ? token : ''} />;
}
