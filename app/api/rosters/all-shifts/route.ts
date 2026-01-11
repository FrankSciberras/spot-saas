import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';

export async function GET() {
  try {
    await requireRole(['driver', 'admin', 'staff']);
    const supabase = await createClient();

    const today = new Date();
    const oneWeekAhead = new Date(today);
    oneWeekAhead.setDate(today.getDate() + 7);

    // Get published rosters that include today or upcoming week
    const { data: rosters, error: rostersError } = await supabase
      .from('rosters')
      .select('*')
      .eq('status', 'published')
      .gte('week_end', today.toISOString().split('T')[0])
      .lte('week_start', oneWeekAhead.toISOString().split('T')[0])
      .order('week_start', { ascending: true });

    if (rostersError) {
      console.error('Error fetching rosters:', rostersError);
      return NextResponse.json({ error: rostersError.message }, { status: 500 });
    }

    if (!rosters || rosters.length === 0) {
      return NextResponse.json([]);
    }

    // Query roster_assignments with vehicles
    const rosterIds = rosters.map(r => r.id);
    const { data: assignments, error: assignmentsError } = await supabase
      .from('roster_assignments')
      .select(`
        *,
        vehicles:vehicle_id (id, registration_number, make, model)
      `)
      .in('roster_id', rosterIds)
      .order('assignment_date', { ascending: true });

    if (assignmentsError) {
      console.error('Error fetching assignments:', assignmentsError);
      return NextResponse.json({ error: assignmentsError.message }, { status: 500 });
    }

    // Fetch ALL drivers using admin client to bypass RLS
    // (drivers can only see their own record by default)
    const adminClient = createAdminClient();
    const { data: allDrivers } = await adminClient
      .from('drivers')
      .select('id, user_id, full_name');
    
    // Create map from all drivers - index by both id and user_id
    const driversMap: Record<string, { id: string; full_name: string }> = {};
    (allDrivers || []).forEach((d: { id: string; user_id: string | null; full_name: string }) => {
      driversMap[d.id] = { id: d.id, full_name: d.full_name };
      if (d.user_id) {
        driversMap[d.user_id] = { id: d.id, full_name: d.full_name };
      }
    });

    // Combine rosters with their assignments, including driver info
    const result = rosters.map(roster => ({
      ...roster,
      roster_assignments: (assignments || [])
        .filter(a => a.roster_id === roster.id)
        .map(a => {
          const driverObj = a.driver_id ? driversMap[a.driver_id] : null;
          const secondaryDriverObj = a.secondary_driver_id ? driversMap[a.secondary_driver_id] : null;
          
          return {
            id: a.id,
            assignment_date: a.assignment_date,
            day_of_week: a.day_of_week,
            vehicle_id: a.vehicle_id,
            driver_id: a.driver_id,
            secondary_driver_id: a.secondary_driver_id,
            vehicles: a.vehicles,
            driver: driverObj,
            secondary_driver: secondaryDriverObj
          };
        })
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in all-shifts API:', error);
    return NextResponse.json(
      { error: 'Unauthorized or server error' },
      { status: 401 }
    );
  }
}
