import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import EarningsWorkspace from './EarningsWorkspace';

/**
 * Admin Monthly Earnings Page
 */
export default async function EarningsPage() {
  const user = await requireRole(['admin']);
  const supabase = await createClient();

  // Fetch all monthly earnings records
  const { data: earnings } = await supabase
    .from('monthly_earnings')
    .select('*')
    .order('month', { ascending: false });

  return (
    <DashboardLayout user={user} variant="admin" title="Monthly Earnings">
      <EarningsWorkspace earnings={earnings || []} />
    </DashboardLayout>
  );
}
