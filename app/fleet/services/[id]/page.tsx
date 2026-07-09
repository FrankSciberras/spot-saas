import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import styles from '@/components/admin/AdminForms.module.css';

interface PageProps {
  params: Promise<{ id: string }>;
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
  oil_change: 'Oil Change',
  tire_rotation: 'Tire Rotation',
  tire_replacement: 'Tire Replacement',
  brake_service: 'Brake Service',
  brake_pads: 'Brake Pads',
  brake_discs: 'Brake Discs',
  air_filter: 'Air Filter',
  cabin_filter: 'Cabin Filter',
  spark_plugs: 'Spark Plugs',
  battery: 'Battery',
  transmission: 'Transmission Service',
  coolant_flush: 'Coolant Flush',
  timing_belt: 'Timing Belt',
  general_inspection: 'General Inspection',
  annual_service: 'Annual Service',
  major_service: 'Major Service',
  repair: 'Repair',
  other: 'Other',
};

export default async function ServiceDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireRole(['admin', 'staff']);
  await requireModule(user.organization_id, 'maintenance');
  const supabase = await createClient();
  const isAdmin = user.role === 'admin';

  const { data: service, error } = await supabase
    .from('vehicle_services')
    .select(`
      *,
      vehicles:vehicle_id (id, registration_number, make, model, mileage),
      users:created_by (full_name, email)
    `)
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .single();

  if (error || !service) {
    notFound();
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  // Calculate km until next service
  const kmUntilService = service.next_service_mileage && service.vehicles
    ? service.next_service_mileage - service.vehicles.mileage
    : null;

  return (
    <FleetShell user={user} title="Service Details">
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <h2>{SERVICE_TYPE_LABELS[service.service_type] || service.service_type}</h2>
          <span className={styles.subtitle}>
            {service.vehicles?.registration_number} • {formatDate(service.service_date)}
          </span>
        </div>
        <div className={styles.pageActions}>
          <Link href="/fleet/services" className="btn btn-secondary">
            ← Back to Services
          </Link>
          {isAdmin && (
            <Link href={`/fleet/services/${id}/edit`} className="btn btn-primary">
              Edit Service
            </Link>
          )}
        </div>
      </div>

      {/* Service Summary */}
      <div className={styles.detailCard}>
        <h3>Service Summary</h3>
        <div className={styles.detailGrid}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Date</span>
            <span className={styles.detailValue}>{formatDate(service.service_date)}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Service Type</span>
            <span className={styles.detailValue}>
              {SERVICE_TYPE_LABELS[service.service_type] || service.service_type}
            </span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Mileage at Service</span>
            <span className={styles.detailValue}>{service.mileage_at_service.toLocaleString()} km</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Cost</span>
            <span className={styles.detailValue}>
              {service.cost 
                ? `${service.currency} ${service.cost.toFixed(2)}`
                : <span className={styles.empty}>Not recorded</span>
              }
            </span>
          </div>
        </div>
      </div>

      {/* Vehicle Info */}
      {service.vehicles && (
        <div className={styles.detailCard}>
          <h3>Vehicle</h3>
          <div className={styles.detailGrid}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Registration</span>
              <span className={styles.detailValue}>
                <Link href={`/fleet/vehicles/${service.vehicles.id}`} className={styles.detailLink}>
                  {service.vehicles.registration_number}
                </Link>
              </span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Vehicle</span>
              <span className={styles.detailValue}>
                {service.vehicles.make} {service.vehicles.model}
              </span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Current Mileage</span>
              <span className={styles.detailValue}>{service.vehicles.mileage.toLocaleString()} km</span>
            </div>
          </div>
        </div>
      )}

      {/* Next Service Due */}
      {(service.next_service_mileage || service.next_service_date) && (
        <div className={styles.detailCard}>
          <h3>Next Service Due</h3>
          <div className={styles.detailGrid}>
            {service.next_service_mileage && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Due at Mileage</span>
                <span className={styles.detailValue}>{service.next_service_mileage.toLocaleString()} km</span>
              </div>
            )}
            {service.next_service_date && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Due by Date</span>
                <span className={styles.detailValue}>{formatDate(service.next_service_date)}</span>
              </div>
            )}
            {kmUntilService !== null && (
              <div className={styles.detailItem}>
                <span className={styles.detailLabel}>Remaining</span>
                <span className={`${styles.detailValue} ${kmUntilService <= 500 ? styles.expiryDanger : kmUntilService <= 2000 ? styles.expiryWarning : styles.expiryOk}`}>
                  {kmUntilService <= 0 
                    ? `${Math.abs(kmUntilService).toLocaleString()} km overdue`
                    : `${kmUntilService.toLocaleString()} km remaining`
                  }
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Service Provider */}
      {service.service_provider && (
        <div className={styles.detailCard}>
          <h3>Service Provider</h3>
          <p className={styles.detailValue}>{service.service_provider}</p>
        </div>
      )}

      {/* Description */}
      {service.description && (
        <div className={styles.detailCard}>
          <h3>Description</h3>
          <p className={styles.notesContent}>{service.description}</p>
        </div>
      )}

      {/* Parts Replaced */}
      {service.parts_replaced && (
        <div className={styles.detailCard}>
          <h3>Parts Replaced</h3>
          <p className={styles.notesContent}>{service.parts_replaced}</p>
        </div>
      )}

      {/* Record Info */}
      <div className={styles.detailCard}>
        <h3>Record Information</h3>
        <div className={styles.detailGrid}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Created</span>
            <span className={styles.detailValue}>
              {new Date(service.created_at).toLocaleString('en-GB')}
            </span>
          </div>
          {service.users && (
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Created By</span>
              <span className={styles.detailValue}>{service.users.full_name || service.users.email}</span>
            </div>
          )}
        </div>
      </div>
    </FleetShell>
  );
}
