import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import AdjustmentsWorkspace from './AdjustmentsWorkspace';

/**
 * Admin Driver Adjustments Page
 * Manage expenses, bonuses, deductions, and reimbursements for drivers
 */
export default async function AdjustmentsPage() {
  const user = await requireRole(['admin', 'staff']);
  const supabase = await createClient();
  const isAdmin = user.role === 'admin';

  // Fetch all drivers
  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, full_name, status')
    .order('full_name');

  // Fetch all adjustments with driver info
  const { data: adjustments } = await supabase
    .from('driver_adjustments')
    .select(`
      *,
      drivers:driver_id (id, full_name)
    `)
    .order('date', { ascending: false });

  return (
    <DashboardLayout user={user} variant="admin" title="Driver Adjustments">
      <AdjustmentsWorkspace 
        drivers={drivers || []}
        adjustments={adjustments || []}
        isAdmin={isAdmin}
      />
    </DashboardLayout>
  );
}
