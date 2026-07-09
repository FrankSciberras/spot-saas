import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import ServiceForm from '@/components/admin/ServiceForm';
import styles from '@/components/admin/AdminForms.module.css';

interface PageProps {
  searchParams: Promise<{ vehicle?: string }>;
}

export default async function NewServicePage({ searchParams }: PageProps) {
  const user = await requireRole(['admin', 'staff']);
  await requireModule(user.organization_id, 'maintenance');
  const supabase = await createClient();
  const { vehicle: preselectedVehicleId } = await searchParams;

  // Get all vehicles
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, registration_number, make, model, mileage')
    .eq('organization_id', user.organization_id)
    .order('registration_number');

  // Pre-populate service with vehicle if provided
  const preselectedVehicle = preselectedVehicleId 
    ? vehicles?.find(v => v.id === preselectedVehicleId)
    : null;

  const initialService = preselectedVehicle ? {
    vehicle_id: preselectedVehicle.id,
    mileage_at_service: preselectedVehicle.mileage,
  } : undefined;

  return (
    <FleetShell user={user} title="Add Service">
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <h2>Add Service Record</h2>
          <span className={styles.subtitle}>
            {preselectedVehicle 
              ? `For ${preselectedVehicle.registration_number} - ${preselectedVehicle.make} ${preselectedVehicle.model}`
              : 'Record a new vehicle service or maintenance'
            }
          </span>
        </div>
        <div className={styles.pageActions}>
          <Link href={preselectedVehicleId ? `/fleet/vehicles/${preselectedVehicleId}` : '/fleet/services'} className="btn btn-secondary">
            ← Back
          </Link>
        </div>
      </div>

      <ServiceForm 
        vehicles={vehicles || []} 
        mode="create" 
        service={initialService as any}
      />
    </FleetShell>
  );
}
