import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';

export default async function StatisticsPage() {
  await requireRole(['admin', 'staff']);
  redirect('/fleet');
}
