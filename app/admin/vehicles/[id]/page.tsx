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

  // Fetch service history (for display - last 5 by date, then by created_at)
  const { data: serviceHistory } = await supabase
    .from('vehicle_services')
    .select('id, service_date, service_type, mileage_at_service, next_service_mileage, cost, currency, created_at')
    .eq('vehicle_id', id)
    .order('service_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(5);

  const { data: assignmentRows } = await supabase
    .from('driver_vehicle_assignments')
    .select(`
      drivers:driver_id (id, full_name, phone)
    `)
    .eq('vehicle_id', id);

  const normalizeDriver = (d: unknown): { id: string; full_name: string; phone?: string | null } | null => {
    if (!d) return null;
    if (Array.isArray(d)) return (d[0] as { id: string; full_name: string; phone?: string | null } | undefined) || null;
    return d as { id: string; full_name: string; phone?: string | null };
  };

  const assignedDrivers = (assignmentRows || [])
    .map((r: unknown) => normalizeDriver((r as { drivers?: unknown }).drivers))
    .filter((d): d is { id: string; full_name: string; phone?: string | null } => Boolean(d));

  // Fetch the most recent service with next_service_mileage (by highest mileage)
  const { data: latestServiceWithDue } = await supabase
    .from('vehicle_services')
    .select('id, next_service_mileage, mileage_at_service')
    .eq('vehicle_id', id)
    .not('next_service_mileage', 'is', null)
    .order('mileage_at_service', { ascending: false })
    .limit(1);

  // Fetch uploaded documents
  const { data: documents } = await supabase
    .from('files')
    .select('id, type, file_url, file_name, uploaded_at')
    .eq('owner_type', 'vehicle')
    .eq('owner_id', id)
    .order('uploaded_at', { ascending: false });

  // Group documents by type
  const groupedDocs: Record<string, typeof documents> = {};
  documents?.forEach(doc => {
    if (!groupedDocs[doc.type]) groupedDocs[doc.type] = [];
    groupedDocs[doc.type]!.push(doc);
  });

  const DOC_TYPE_LABELS: Record<string, string> = {
    VEHICLE_INSURANCE: 'Insurance',
    ROAD_LICENSE: 'Road License',
    LOGBOOK: 'Logbook',
    OTHER: 'Other Documents',
  };

  // Get next service due (from query ordered by highest mileage)
  const nextServiceDue = latestServiceWithDue?.[0] || null;
  const kmUntilService = nextServiceDue?.next_service_mileage
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
        
        {/* Insurance */}
        <div className={styles.documentRow}>
          <div className={styles.documentInfo}>
            <span className={styles.documentLabel}>🛡️ Vehicle Insurance</span>
            <span className={`${styles.detailValue} ${getExpiryClass(vehicleData.insurance_expiry_date)}`}>
              Expires: {formatDate(vehicleData.insurance_expiry_date)}
              {getExpiryLabel(vehicleData.insurance_expiry_date)}
            </span>
          </div>
          <div className={styles.documentUpload}>
            {groupedDocs.VEHICLE_INSURANCE?.map(doc => (
              <a
                key={doc.id}
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.uploadedFile}
              >
                📄 {doc.file_name || 'Insurance Document'}
              </a>
            ))}
            {!groupedDocs.VEHICLE_INSURANCE?.length && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No file uploaded</span>
            )}
          </div>
        </div>

        {/* Road License */}
        <div className={styles.documentRow}>
          <div className={styles.documentInfo}>
            <span className={styles.documentLabel}>📋 Road License</span>
            <span className={`${styles.detailValue} ${getExpiryClass(vehicleData.road_license_expiry_date)}`}>
              Expires: {formatDate(vehicleData.road_license_expiry_date)}
              {getExpiryLabel(vehicleData.road_license_expiry_date)}
            </span>
          </div>
          <div className={styles.documentUpload}>
            {groupedDocs.ROAD_LICENSE?.map(doc => (
              <a
                key={doc.id}
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.uploadedFile}
              >
                📄 {doc.file_name || 'Road License'}
              </a>
            ))}
            {!groupedDocs.ROAD_LICENSE?.length && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No file uploaded</span>
            )}
          </div>
        </div>

        {/* Logbook */}
        <div className={styles.documentRow}>
          <div className={styles.documentInfo}>
            <span className={styles.documentLabel}>📖 Logbook</span>
            <span className={styles.documentHint}>Vehicle registration logbook</span>
          </div>
          <div className={styles.documentUpload}>
            {groupedDocs.LOGBOOK?.map(doc => (
              <a
                key={doc.id}
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.uploadedFile}
              >
                📄 {doc.file_name || 'Logbook'}
              </a>
            ))}
            {!groupedDocs.LOGBOOK?.length && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No file uploaded</span>
            )}
          </div>
        </div>

        {/* Other Documents */}
        <div className={styles.documentRow}>
          <div className={styles.documentInfo}>
            <span className={styles.documentLabel}>📁 Other Documents</span>
          </div>
          <div className={styles.documentUpload}>
            {groupedDocs.OTHER?.map(doc => (
              <a
                key={doc.id}
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.uploadedFile}
              >
                📄 {doc.file_name || 'Document'}
              </a>
            ))}
            {!groupedDocs.OTHER?.length && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No file uploaded</span>
            )}
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
        <h3>Assigned Drivers</h3>
        {assignedDrivers.length > 0 ? (
          <div className={styles.detailGrid}>
            {assignedDrivers.map((d) => (
              <div key={d.id} className={styles.detailItem}>
                <span className={styles.detailLabel}>Driver</span>
                <span className={styles.detailValue}>
                  <Link href={`/admin/drivers/${d.id}`} className={styles.detailLink}>
                    {d.full_name}
                  </Link>
                  {d.phone ? ` (${d.phone})` : ''}
                </span>
              </div>
            ))}
          </div>
        ) : vehicleData.drivers ? (
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
