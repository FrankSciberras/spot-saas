import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import SettlementsWorkspace from './SettlementsWorkspace';

/**
 * Admin Settlements Page - Batch Entry Workspace
 */
export default async function SettlementsPage() {
  const user = await requireRole(['admin', 'staff']);
  const supabase = await createClient();
  const isAdmin = user.role === 'admin';

  // Fetch all drivers (active and inactive for archive)
  const { data: allDrivers } = await supabase
    .from('drivers')
    .select('id, full_name, status, employment_type')
    .order('full_name');

  // Separate active and archived drivers
  const activeDrivers = (allDrivers || []).filter(d => d.status === 'active');
  const archivedDrivers = (allDrivers || []).filter(d => d.status !== 'active');

  // Fetch all settlements (we'll filter client-side by week)
  const { data: settlements } = await supabase
    .from('driver_settlements')
    .select(`
      *,
      drivers:driver_id (id, full_name, status),
      settlement_platforms (*)
    `)
    .order('week_start', { ascending: false });

  return (
    <FleetShell user={user} title="Driver Settlements">
      <SettlementsWorkspace 
        activeDrivers={activeDrivers}
        archivedDrivers={archivedDrivers}
        settlements={settlements || []}
        isAdmin={isAdmin}
      />
    </FleetShell>
  );
}
