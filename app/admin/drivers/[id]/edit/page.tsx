import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import DriverInlineEdit from '@/components/admin/DriverInlineEdit';
import DeleteDriverButton from '@/components/admin/DeleteDriverButton';
import styles from '@/components/admin/AdminForms.module.css';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Edit Driver Page - Inline editing with same layout as detail view
 */
export default async function EditDriverPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireRole(['admin']);
  const supabase = await createClient();

  // Fetch the driver with relations
  const { data: driver, error } = await supabase
    .from('drivers')
    .select(`
      *,
      users:user_id (id, email, full_name),
      vehicles:assigned_vehicle_id (id, registration_number, make, model)
    `)
    .eq('id', id)
    .single();

  if (error || !driver) {
    notFound();
  }

  // Fetch vehicles for assignment dropdown
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, registration_number, make, model, assigned_driver_id')
    .order('registration_number');

  // Fetch documents for this driver
  const { data: documents } = await supabase
    .from('files')
    .select('id, type, file_url, file_name, uploaded_at')
    .eq('owner_type', 'driver')
    .eq('owner_id', id)
    .order('uploaded_at', { ascending: false });

  // Fetch recent shifts
  const { data: recentShifts } = await supabase
    .from('driver_shifts')
    .select('id, start_time, end_time, starting_mileage')
    .eq('driver_id', id)
    .order('start_time', { ascending: false })
    .limit(5);

  return (
    <DashboardLayout user={user} variant="admin" title={`Edit: ${driver.full_name}`}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <Link href={`/admin/drivers/${id}`} className={styles.backButton} aria-label="Back to driver">
            <span>←</span>
          </Link>
          <div className={styles.pageTitleMain}>
            <h2>{driver.full_name}</h2>
            <span className={styles.subtitle}>
              <span className="badge badge-info">Editing</span>
            </span>
          </div>
        </div>
        <div className={styles.pageActions}>
          <Link href={`/admin/drivers/${id}`} className="btn btn-secondary">
            Done Editing
          </Link>
          <DeleteDriverButton driverId={id} driverName={driver.full_name} />
        </div>
      </div>

      <DriverInlineEdit 
        driver={driver}
        vehicles={vehicles || []} 
        documents={documents || []}
        recentShifts={recentShifts || []}
      />
    </DashboardLayout>
  );
}
