import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import RosterEditor from '@/components/admin/RosterEditor';

export default async function NewRosterPage() {
  const user = await requireRole(['admin', 'staff']);
  await requireModule(user.organization_id, 'rostering');
  const isAdmin = user.role === 'admin';
  const supabase = await createClient();

  // Get all vehicles (active preferred, but show all if none active)
  const { data: activeVehicles } = await supabase
    .from('vehicles')
    .select('id, registration_number, make, model')
    .eq('organization_id', user.organization_id)
    .eq('status', 'active')
    .order('registration_number');

  // If no active vehicles, get all vehicles
  let vehicles = activeVehicles;
  if (!activeVehicles || activeVehicles.length === 0) {
    const { data: allVehicles } = await supabase
      .from('vehicles')
      .select('id, registration_number, make, model')
      .eq('organization_id', user.organization_id)
      .order('registration_number');
    vehicles = allVehicles;
  }

  // Get all drivers (active preferred, but show all if none active)
  const { data: activeDrivers } = await supabase
    .from('drivers')
    .select('id, full_name, phone')
    .eq('organization_id', user.organization_id)
    .eq('status', 'active')
    .order('full_name');

  // If no active drivers, get all drivers
  let drivers = activeDrivers;
  if (!activeDrivers || activeDrivers.length === 0) {
    const { data: allDrivers } = await supabase
      .from('drivers')
      .select('id, full_name, phone')
      .eq('organization_id', user.organization_id)
      .order('full_name');
    drivers = allDrivers;
  }

  return (
    <FleetShell user={user} title="New Roster">
      <RosterEditor
        vehicles={vehicles || []}
        drivers={drivers || []}
        mode="create"
        isAdmin={isAdmin}
      />
    </FleetShell>
  );
}
