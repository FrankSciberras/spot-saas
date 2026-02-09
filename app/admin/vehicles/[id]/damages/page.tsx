import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import VehicleDamageTracker from '@/components/admin/VehicleDamageTracker';
import styles from '@/components/admin/AdminForms.module.css';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Vehicle Damages Page
 */
export default async function VehicleDamagesPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireRole(['admin', 'staff']);
  const supabase = await createClient();
  const isAdmin = user.role === 'admin';

  const { data: vehicle, error: vehicleError } = await supabase
    .from('vehicles')
    .select('id, registration_number, make, model, year')
    .eq('id', id)
    .single();

  if (vehicleError || !vehicle) {
    notFound();
  }

  const { data: damages } = await supabase
    .from('vehicle_damages')
    .select(`
      *,
      reporter:reported_by (full_name, email)
    `)
    .eq('vehicle_id', id)
    .order('reported_at', { ascending: false });

  return (
    <DashboardLayout
      user={user}
      variant="admin"
      title={`Damages - ${vehicle.registration_number}`}
    >
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <Link href={`/admin/vehicles/${id}`} className={styles.backButton} aria-label="Back to vehicle">
            <span>←</span>
          </Link>
          <div className={styles.pageTitleMain}>
            <h2>Vehicle Damages</h2>
            <span className={styles.subtitle}>
              {vehicle.registration_number} - {vehicle.make} {vehicle.model} {vehicle.year && `(${vehicle.year})`}
            </span>
          </div>
        </div>
        <div className={styles.pageActions}>
          <Link href={`/admin/vehicles/${id}`} className="btn btn-secondary">
            ← Back to Vehicle
          </Link>
        </div>
      </div>

      <VehicleDamageTracker
        vehicleId={id}
        initialDamages={damages || []}
        isAdmin={isAdmin}
      />
    </DashboardLayout>
  );
}
