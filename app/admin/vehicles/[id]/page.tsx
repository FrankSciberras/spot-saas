import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import DeleteVehicleButton from '@/components/admin/DeleteVehicleButton';
import type { Vehicle, Driver } from '@/lib/types/database';
import styles from '@/components/admin/AdminForms.module.css';

interface VehicleWithRelations extends Vehicle {
  drivers: Driver | null;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Vehicle Detail Page
 */
export default async function VehicleDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireRole(['admin', 'staff']);
  const supabase = await createClient();
  const isAdmin = user.role === 'admin';

  const { data: vehicle, error } = await supabase
    .from('vehicles')
    .select(`
      *,
      drivers:assigned_driver_id (id, full_name, phone)
    `)
    .eq('id', id)
    .single();

  if (error || !vehicle) {
    notFound();
  }

  const vehicleData = vehicle as VehicleWithRelations;

  // Helper functions
  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'Not set';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getExpiryClass = (dateStr: string | null): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const thirtyDays = new Date();
    thirtyDays.setDate(now.getDate() + 30);
    
    if (date < now) return styles.expiryDanger;
    if (date <= thirtyDays) return styles.expiryWarning;
    return styles.expiryOk;
  };

  const getExpiryLabel = (dateStr: string | null): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    
    if (date < now) return ' (Expired)';
    
    const thirtyDays = new Date();
    thirtyDays.setDate(now.getDate() + 30);
    if (date <= thirtyDays) return ' (Expiring soon)';
    
    return '';
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'active': return 'badge-success';
      case 'in_service': return 'badge-warning';
      case 'out_of_service': return 'badge-danger';
      default: return 'badge-secondary';
    }
  };

  // Fetch recent shifts for this vehicle
  const { data: recentShifts } = await supabase
    .from('driver_shifts')
    .select(`
      id, 
      start_time, 
      end_time, 
      starting_mileage,
      drivers:driver_id (full_name)
    `)
    .eq('vehicle_id', id)
    .order('start_time', { ascending: false })
    .limit(5);

  // Fetch service history
  const { data: serviceHistory } = await supabase
    .from('vehicle_services')
    .select('id, service_date, service_type, mileage_at_service, next_service_mileage, cost, currency')
    .eq('vehicle_id', id)
    .order('service_date', { ascending: false })
    .limit(5);

  // Get next service due (from most recent service with next_service_mileage)
  const nextServiceDue = serviceHistory?.find(s => s.next_service_mileage);
  const kmUntilService = nextServiceDue 
    ? nextServiceDue.next_service_mileage - vehicleData.mileage 
    : null;

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
    transmission: 'Transmission',
    coolant_flush: 'Coolant Flush',
    timing_belt: 'Timing Belt',
    general_inspection: 'General Inspection',
    annual_service: 'Annual Service',
    major_service: 'Major Service',
    repair: 'Repair',
    other: 'Other',
  };

  return (
    <DashboardLayout user={user} variant="admin" title={vehicleData.registration_number}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <Link href="/admin/vehicles" className={styles.backButton} aria-label="Back to vehicles">
            <span>←</span>
          </Link>
          <div className={styles.pageTitleMain}>
            <h2>{vehicleData.registration_number}</h2>
            <span className={styles.subtitle}>
              {vehicleData.make} {vehicleData.model} {vehicleData.year && `(${vehicleData.year})`}
              <span className={`badge ${getStatusBadgeClass(vehicleData.status)}`} style={{ marginLeft: '0.5rem' }}>
                {vehicleData.status.replace('_', ' ')}
              </span>
            </span>
          </div>
        </div>
        <div className={styles.pageActions}>
          {isAdmin && (
            <>
              <Link href={`/admin/vehicles/${id}/edit`} className="btn btn-primary">
                Edit Vehicle
              </Link>
              <DeleteVehicleButton vehicleId={id} vehicleReg={vehicleData.registration_number} />
            </>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className={styles.statsRow}>
        <div className={styles.statItem}>
          <div className="value">{vehicleData.mileage?.toLocaleString() || 0}</div>
          <div className="label">Current Mileage (km)</div>
        </div>
        <div className={styles.statItem}>
          <div className="value">{vehicleData.year || '-'}</div>
          <div className="label">Year</div>
        </div>
        <div className={styles.statItem}>
          <div className="value">{vehicleData.color || '-'}</div>
          <div className="label">Color</div>
        </div>
      </div>

      {/* Vehicle Information */}
      <div className={styles.detailCard}>
        <h3>Vehicle Information</h3>
        <div className={styles.detailGrid}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Registration Number</span>
            <span className={styles.detailValue}>{vehicleData.registration_number}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Make</span>
            <span className={styles.detailValue}>{vehicleData.make}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Model</span>
            <span className={styles.detailValue}>{vehicleData.model}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Year</span>
            <span className={`${styles.detailValue} ${!vehicleData.year ? styles.empty : ''}`}>
              {vehicleData.year || 'Not set'}
            </span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Color</span>
            <span className={`${styles.detailValue} ${!vehicleData.color ? styles.empty : ''}`}>
              {vehicleData.color || 'Not set'}
            </span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Current Mileage</span>
            <span className={styles.detailValue}>{vehicleData.mileage?.toLocaleString() || 0} km</span>
          </div>
        </div>
      </div>

      {/* Documents & Expiry */}
      <div className={styles.detailCard}>
        <h3>Documents &amp; Expiry Dates</h3>
        <div className={styles.detailGrid}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Insurance Expiry</span>
            <span className={`${styles.detailValue} ${getExpiryClass(vehicleData.insurance_expiry_date)}`}>
              {formatDate(vehicleData.insurance_expiry_date)}
              {getExpiryLabel(vehicleData.insurance_expiry_date)}
            </span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Road License Expiry</span>
            <span className={`${styles.detailValue} ${getExpiryClass(vehicleData.road_license_expiry_date)}`}>
              {formatDate(vehicleData.road_license_expiry_date)}
              {getExpiryLabel(vehicleData.road_license_expiry_date)}
            </span>
          </div>
        </div>
      </div>

      {/* Service Status */}
      <div className={styles.detailCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Service &amp; Maintenance</h3>
          <Link href={`/admin/services/new?vehicle=${id}`} className="btn btn-sm btn-primary">
            + Add Service
          </Link>
        </div>
        
        {/* Next Service Due Alert */}
        {kmUntilService !== null && (
          <div style={{ 
            padding: '1rem', 
            borderRadius: '0.5rem', 
            marginBottom: '1rem',
            background: kmUntilService <= 500 ? 'rgba(239, 68, 68, 0.1)' : kmUntilService <= 2000 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(34, 197, 94, 0.1)',
            border: `1px solid ${kmUntilService <= 500 ? 'rgba(239, 68, 68, 0.3)' : kmUntilService <= 2000 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ color: kmUntilService <= 500 ? '#dc2626' : kmUntilService <= 2000 ? '#d97706' : '#16a34a' }}>
                  Next Service Due
                </strong>
                <span style={{ marginLeft: '1rem', color: 'var(--text-secondary)' }}>
                  at {nextServiceDue?.next_service_mileage?.toLocaleString()} km
                </span>
              </div>
              <span style={{ 
                fontWeight: 600, 
                color: kmUntilService <= 500 ? '#dc2626' : kmUntilService <= 2000 ? '#d97706' : '#16a34a' 
              }}>
                {kmUntilService <= 0 
                  ? `${Math.abs(kmUntilService).toLocaleString()} km overdue`
                  : `${kmUntilService.toLocaleString()} km remaining`
                }
              </span>
            </div>
          </div>
        )}

        {/* Service History Table */}
        {serviceHistory && serviceHistory.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Service Type</th>
                  <th>Mileage</th>
                  <th>Next Due</th>
                  <th>Cost</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {serviceHistory.map((service) => (
                  <tr key={service.id}>
                    <td>{formatDate(service.service_date)}</td>
                    <td>{SERVICE_TYPE_LABELS[service.service_type] || service.service_type}</td>
                    <td>{service.mileage_at_service.toLocaleString()} km</td>
                    <td>
                      {service.next_service_mileage 
                        ? `${service.next_service_mileage.toLocaleString()} km`
                        : '-'
                      }
                    </td>
                    <td>
                      {service.cost 
                        ? `${service.currency} ${service.cost.toFixed(2)}`
                        : '-'
                      }
                    </td>
                    <td>
                      <Link href={`/admin/services/${service.id}`} style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ textAlign: 'center', padding: '0.75rem' }}>
              <Link href={`/admin/services?vehicle_id=${id}`} style={{ color: 'var(--color-primary)', textDecoration: 'none', fontSize: '0.875rem' }}>
                View All Services →
              </Link>
            </div>
          </div>
        ) : (
          <p className="text-muted">No service records for this vehicle.</p>
        )}
      </div>

      {/* Assigned Driver */}
      <div className={styles.detailCard}>
        <h3>Assigned Driver</h3>
        {vehicleData.drivers ? (
          <div className={styles.detailGrid}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Driver Name</span>
              <span className={styles.detailValue}>
                <Link href={`/admin/drivers/${vehicleData.drivers.id}`} className={styles.detailLink}>
                  {vehicleData.drivers.full_name}
                </Link>
              </span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Phone</span>
              <span className={`${styles.detailValue} ${!vehicleData.drivers.phone ? styles.empty : ''}`}>
                {vehicleData.drivers.phone || 'Not set'}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-muted">No driver assigned to this vehicle.</p>
        )}
      </div>

      {/* Recent Shifts */}
      <div className={styles.detailCard}>
        <h3>Recent Shifts</h3>
        {recentShifts && recentShifts.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Driver</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Mileage</th>
                </tr>
              </thead>
              <tbody>
                {recentShifts.map((shift) => (
                  <tr key={shift.id}>
                    <td>{new Date(shift.start_time).toLocaleDateString('en-GB')}</td>
                    <td>{(shift.drivers as unknown as { full_name: string } | null)?.full_name || '-'}</td>
                    <td>{new Date(shift.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>
                      {shift.end_time 
                        ? new Date(shift.end_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                        : <span className="badge badge-success">Active</span>
                      }
                    </td>
                    <td>{shift.starting_mileage.toLocaleString()} km</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted">No shifts recorded for this vehicle.</p>
        )}
      </div>

      {/* Notes */}
      {vehicleData.notes && (
        <div className={styles.detailCard}>
          <h3>Notes</h3>
          <p className={styles.notesContent}>{vehicleData.notes}</p>
        </div>
      )}

      {/* Meta Information */}
      <div className={styles.detailCard}>
        <h3>Record Information</h3>
        <div className={styles.detailGrid}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Added to Fleet</span>
            <span className={styles.detailValue}>
              {new Date(vehicleData.created_at).toLocaleString('en-GB')}
            </span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Last Updated</span>
            <span className={styles.detailValue}>
              {new Date(vehicleData.updated_at).toLocaleString('en-GB')}
            </span>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
