import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import FinancialsDashboard from '@/components/admin/FinancialsDashboard';

export default async function FinancialsPage() {
  const user = await requireRole(['admin']);
  const supabase = await createClient();

  const { data: entries } = await supabase
    .from('weekly_bookkeeping')
    .select('*')
    .order('week_start', { ascending: true });

  return (
    <DashboardLayout user={user} variant="admin" title="Financials">
      <FinancialsDashboard entries={entries || []} />
    </DashboardLayout>
  );
}
