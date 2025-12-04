import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import DeleteDriverButton from '@/components/admin/DeleteDriverButton';
import type { Driver, Vehicle, User } from '@/lib/types/database';
import styles from '@/components/admin/AdminForms.module.css';

interface DriverWithRelations extends Driver {
  users: User | null;
  vehicles: Vehicle | null;
}

interface FileRecord {
  id: string;
  type: string;
  file_url: string;
  file_name: string | null;
  uploaded_at: string;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Driver Detail Page
 */
export default async function DriverDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireRole(['admin', 'staff']);
  const supabase = await createClient();
  const isAdmin = user.role === 'admin';

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

  const driverData = driver as DriverWithRelations;

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

  // Fetch documents/attachments for this driver
  const { data: documents } = await supabase
    .from('files')
    .select('id, type, file_url, file_name, uploaded_at')
    .eq('owner_type', 'driver')
    .eq('owner_id', id)
    .order('uploaded_at', { ascending: false });

  // Fetch recent shifts for this driver
  const { data: recentShifts } = await supabase
    .from('driver_shifts')
    .select('id, start_time, end_time, starting_mileage')
    .eq('driver_id', id)
    .order('start_time', { ascending: false })
    .limit(5);

  // Group documents by type
  const getDocumentsByType = (type: string): FileRecord[] => {
    return (documents || []).filter((doc: FileRecord) => doc.type === type);
  };

  const documentTypes = [
    { key: 'ID_CARD', label: 'ID Card' },
    { key: 'DRIVING_LICENSE', label: 'Driving License' },
    { key: 'POLICE_CONDUCT', label: 'Police Conduct' },
    { key: 'TAG_LICENSE', label: 'TAG License' },
  ];

  return (
    <DashboardLayout user={user} variant="admin" title={driverData.full_name}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <Link href="/admin/drivers" className={styles.backButton} aria-label="Back to drivers">
            <span>←</span>
          </Link>
          <div className={styles.pageTitleMain}>
            <h2>{driverData.full_name}</h2>
            <span className={styles.subtitle}>
              <span className={`badge ${driverData.status === 'active' ? 'badge-success' : 'badge-secondary'}`}>
                {driverData.status}
              </span>
            </span>
          </div>
        </div>
        <div className={styles.pageActions}>
          {isAdmin && (
            <>
              <Link href={`/admin/drivers/${id}/edit`} className="btn btn-primary">
                Edit Driver
              </Link>
              <DeleteDriverButton driverId={id} driverName={driverData.full_name} />
            </>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className={styles.statsRow}>
        <div className={styles.statItem}>
          <div className="value">
            {driverData.status === 'active' ? 'Active' : 'Inactive'}
          </div>
          <div className="label">Status</div>
        </div>

        <div className={styles.statItem}>
          <div className="value">
            {driverData.vehicles ? driverData.vehicles.registration_number : '—'}
          </div>
          <div className="label">Assigned Vehicle</div>
        </div>

        <div className={styles.statItem}>
          <div className="value">
            {new Date(driverData.created_at).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </div>
          <div className="label">Member Since</div>
        </div>
      </div>

      {/* Personal Information */}
      <div className={styles.detailCard}>
        <h3>Personal Information</h3>
        <div className={styles.detailGrid}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Full Name</span>
            <span className={styles.detailValue}>{driverData.full_name}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Email</span>
            <span className={styles.detailValue}>
              {driverData.users?.email || <span className="text-muted">Not linked</span>}
            </span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Phone</span>
            <span className={`${styles.detailValue} ${!driverData.phone ? styles.empty : ''}`}>
              {driverData.phone || 'Not set'}
            </span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Address</span>
            <span className={`${styles.detailValue} ${!driverData.address ? styles.empty : ''}`}>
              {driverData.address || 'Not set'}
            </span>
          </div>
        </div>
      </div>

      {/* ID & License Information */}
      <div className={styles.detailCard}>
        <h3>ID &amp; License Information</h3>
        <div className={styles.detailGrid}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>ID Card Number</span>
            <span className={`${styles.detailValue} ${!driverData.id_card_number ? styles.empty : ''}`}>
              {driverData.id_card_number || 'Not set'}
            </span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>ID Card Expiry</span>
            <span className={`${styles.detailValue} ${getExpiryClass(driverData.id_card_expiry_date)}`}>
              {formatDate(driverData.id_card_expiry_date)}
              {getExpiryLabel(driverData.id_card_expiry_date)}
            </span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Driving License Number</span>
            <span className={`${styles.detailValue} ${!driverData.driving_license_number ? styles.empty : ''}`}>
              {driverData.driving_license_number || 'Not set'}
            </span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>License Expiry</span>
            <span className={`${styles.detailValue} ${getExpiryClass(driverData.driving_license_expiry_date)}`}>
              {formatDate(driverData.driving_license_expiry_date)}
              {getExpiryLabel(driverData.driving_license_expiry_date)}
            </span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Police Conduct Expiry</span>
            <span className={`${styles.detailValue} ${getExpiryClass(driverData.police_conduct_expiry_date)}`}>
              {formatDate(driverData.police_conduct_expiry_date)}
              {getExpiryLabel(driverData.police_conduct_expiry_date)}
            </span>
          </div>
        </div>
      </div>

      {/* Documents & Attachments */}
      <div className={styles.detailCard}>
        <h3>Documents &amp; Attachments</h3>
        <div className={styles.detailGrid}>
          {documentTypes.map((docType) => {
            const attachments = getDocumentsByType(docType.key);
            return (
              <div key={docType.key} className={styles.detailItem}>
                <span className={styles.detailLabel}>{docType.label}</span>
                <span className={styles.detailValue}>
                  {attachments.length > 0 ? (
                    <span className={styles.attachmentLinks}>
                      {attachments.map((file: FileRecord) => (
                        <a
                          key={file.id}
                          href={file.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.attachmentLink}
                        >
                          📎 {file.file_name || 'View Document'}
                        </a>
                      ))}
                    </span>
                  ) : (
                    <span className={styles.empty}>No file uploaded</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Assigned Vehicle */}
      <div className={styles.detailCard}>
        <h3>Assigned Vehicle</h3>
        {driverData.vehicles ? (
          <div className={styles.detailGrid}>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Registration</span>
              <span className={styles.detailValue}>
                <Link href={`/admin/vehicles/${driverData.vehicles.id}`} className={styles.detailLink}>
                  {driverData.vehicles.registration_number}
                </Link>
              </span>
            </div>
            <div className={styles.detailItem}>
              <span className={styles.detailLabel}>Vehicle</span>
              <span className={styles.detailValue}>
                {driverData.vehicles.make} {driverData.vehicles.model}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-muted">No vehicle assigned to this driver.</p>
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
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Starting Mileage</th>
                </tr>
              </thead>
              <tbody>
                {recentShifts.map(shift => (
                  <tr key={shift.id}>
                    <td>{new Date(shift.start_time).toLocaleDateString('en-GB')}</td>
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
          <p className="text-muted">No shifts recorded for this driver.</p>
        )}
      </div>

      {/* Notes */}
      {driverData.notes && (
        <div className={styles.detailCard}>
          <h3>Notes</h3>
          <p className={styles.notesContent}>{driverData.notes}</p>
        </div>
      )}

      {/* Meta Information */}
      <div className={styles.detailCard}>
        <h3>Record Information</h3>
        <div className={styles.detailGrid}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Created</span>
            <span className={styles.detailValue}>
              {new Date(driverData.created_at).toLocaleString('en-GB')}
            </span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Last Updated</span>
            <span className={styles.detailValue}>
              {new Date(driverData.updated_at).toLocaleString('en-GB')}
            </span>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
