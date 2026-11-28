import type { Metadata } from 'next';
import AccountArchivedClient from './AccountArchivedClient';

export const metadata: Metadata = {
  title: 'Access archived',
  robots: { index: false, follow: false },
};

/**
 * Where a driver lands when their fleet has archived them and they belong to
 * no other fleet (sent by requireAuth / the dashboard resolver / login).
 */
export default function AccountArchivedPage() {
  return <AccountArchivedClient />;
}
