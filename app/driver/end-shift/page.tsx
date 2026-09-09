import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import EndShiftClient from './EndShiftClient';
import styles from './end-shift.module.css';

interface VehicleLite {
  id: string;
  registration_number: string;
  make: string;
  model: string;
}

/**
 * End Shift — records the closing odometer reading (and optional photos) for
 * the driver's open shift, then closes it. Replaces the old one-tap "End shift"
 * that stamped end_time and nothing else.
 */
export default async function EndShiftPage() {
  const user = await requireRole(['driver']);
  const supabase = await createClient();

  // Driver row for the ACTIVE fleet (a driver in two fleets has two rows).
  const { data: driver } = await supabase
    .from('drivers')
    .select('id')
    .eq('user_id', user.id)
    .eq('organization_id', user.organization_id)
    .maybeSingle();

  const { data: shift } = driver
    ? await supabase
        .from('driver_shifts')
        .select('id, start_time, starting_mileage, vehicles:vehicle_id (id, registration_number, make, model)')
        .eq('driver_id', driver.id)
        .eq('organization_id', user.organization_id)
        .is('end_time', null)
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  if (!shift) {
    return (
      <FleetShell user={user} variant="driver" title="End Shift">
        <div className={styles.page}>
          <div className={styles.card}>
            <h2 className={styles.title}>No open shift</h2>
            <p className={styles.muted}>You are not on shift right now.</p>
            <Link href="/driver/go-online" className={styles.primaryLink}>
              Start a shift
            </Link>
          </div>
        </div>
      </FleetShell>
    );
  }

  const rawVehicle = shift.vehicles as VehicleLite | VehicleLite[] | null;
  const vehicle = Array.isArray(rawVehicle) ? rawVehicle[0] : rawVehicle;
  const vehicleLabel = vehicle
    ? `${vehicle.registration_number} · ${vehicle.make} ${vehicle.model}`
    : 'Unknown vehicle';

  return (
    <FleetShell user={user} variant="driver" title="End Shift">
      <div className={styles.page}>
        <EndShiftClient
          shiftId={shift.id}
          startTime={shift.start_time}
          startingMileage={shift.starting_mileage}
          vehicleLabel={vehicleLabel}
          timeZone={process.env.NEXT_PUBLIC_TIME_ZONE || 'Europe/Malta'}
        />
      </div>
    </FleetShell>
  );
}
