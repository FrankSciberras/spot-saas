import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import ServiceForm from '@/components/admin/ServiceForm';
import styles from '@/components/admin/AdminForms.module.css';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditServicePage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireRole(['admin']);
  await requireModule(user.organization_id, 'maintenance');
  const supabase = await createClient();

  // Get the service
  const { data: service, error } = await supabase
    .from('vehicle_services')
    .select('*')
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .single();

  if (error || !service) {
    notFound();
  }

  // Get all vehicles
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, registration_number, make, model, mileage')
    .eq('organization_id', user.organization_id)
    .order('registration_number');

  return (
    <FleetShell user={user} title="Edit Service">
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleMain}>
          <h2>Edit Service</h2>
          <span className={styles.subtitle}>
            Update service record details
          </span>
        </div>
        <div className={styles.pageActions}>
          <Link href={`/fleet/services/${id}`} className="btn btn-secondary">
            ← Back to Service
          </Link>
        </div>
      </div>

      <ServiceForm 
        service={service} 
        vehicles={vehicles || []} 
        mode="edit" 
      />
    </FleetShell>
  );
}
