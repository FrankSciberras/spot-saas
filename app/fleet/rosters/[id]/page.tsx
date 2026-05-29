import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import FleetShell from '@/components/fleet/FleetShell';
import RosterEditor from '@/components/admin/RosterEditor';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function RosterDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireRole(['admin', 'staff']);
  const supabase = await createClient();

  // Get roster with assignments
  const { data: roster, error: rosterError } = await supabase
    .from('rosters')
    .select('*')
    .eq('id', id)
    .single();

  if (rosterError || !roster) {
    notFound();
  }

  // Get assignments
  const { data: assignments } = await supabase
    .from('roster_assignments')
    .select('*')
    .eq('roster_id', id);

  // Get all vehicles (active preferred, but show all if none active)
  const { data: activeVehicles } = await supabase
    .from('vehicles')
    .select('id, registration_number, make, model')
    .eq('status', 'active')
    .order('registration_number');

  let vehicles = activeVehicles;
  if (!activeVehicles || activeVehicles.length === 0) {
    const { data: allVehicles } = await supabase
      .from('vehicles')
      .select('id, registration_number, make, model')
      .order('registration_number');
    vehicles = allVehicles;
  }

  // Get all drivers (active preferred, but show all if none active)
  const { data: activeDrivers } = await supabase
    .from('drivers')
    .select('id, full_name, phone')
    .eq('status', 'active')
    .order('full_name');

  let drivers = activeDrivers;
  if (!activeDrivers || activeDrivers.length === 0) {
    const { data: allDrivers } = await supabase
      .from('drivers')
      .select('id, full_name, phone')
      .order('full_name');
    drivers = allDrivers;
  }

  const rosterWithAssignments = {
    ...roster,
    assignments: assignments || [],
  };

  return (
    <FleetShell user={user} title={roster.title || 'Edit Roster'}>
      <RosterEditor 
        roster={rosterWithAssignments}
        vehicles={vehicles || []} 
        drivers={drivers || []} 
        mode="edit"
      />
    </FleetShell>
  );
}
