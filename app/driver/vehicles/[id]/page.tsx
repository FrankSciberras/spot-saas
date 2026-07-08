import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import type { Vehicle, FileRecord } from '@/lib/types/database';
import styles from '@/components/admin/AdminForms.module.css';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Driver Vehicle Detail Page
 */
export default async function DriverVehicleDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireRole(['driver']);
  const supabase = await createClient();

  const { data: vehicle, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !vehicle) {
    notFound();
  }

  const vehicleData = vehicle as Vehicle;

  const { data: documents } = await supabase
    .from('files')
    .select('id, owner_type, owner_id, type, file_url, file_name, expiry_date, uploaded_at, created_at')
    .eq('owner_type', 'vehicle')
    .eq('owner_id', id)
    .order('uploaded_at', { ascending: false });

  const groupedDocs: Record<string, (FileRecord & { file_url: string })[]> = {};
  (documents as unknown as FileRecord[] | null)?.forEach((doc) => {
    const key = doc.type;
    if (!groupedDocs[key]) groupedDocs[key] = [];
    groupedDocs[key]!.push(doc as FileRecord & { file_url: string });
  });

  const DOC_TYPE_LABELS: Record<string, string> = {
    VEHICLE_INSURANCE: 'Insurance',
    ROAD_LICENSE: 'Road License',
    LOGBOOK: 'Logbook',
    OTHER: 'Other Documents',
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'Not set';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
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
      case 'active':
        return 'badge-success';
      case 'in_service':
        return 'badge-warning';
      case 'out_of_service':
        return 'badge-danger';
      default:
        return 'badge-secondary';
    }
  };

  return (
    <FleetShell user={user} variant="driver" title={vehicleData.registration_number}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <Link href="/driver/vehicles" className={styles.backButton} aria-label="Back to vehicles">
            <span>←</span>
          </Link>
          <div className={styles.pageTitleMain}>
            <h2>{vehicleData.registration_number}</h2>
            <span className={styles.subtitle}>
              {vehicleData.make} {vehicleData.model} {vehicleData.year && `(${vehicleData.year})`}
              <span
                className={`badge ${getStatusBadgeClass(vehicleData.status)}`}
                style={{ marginLeft: '0.5rem' }}
              >
                {vehicleData.status.replace('_', ' ')}
              </span>
            </span>
          </div>
        </div>
      </div>

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

      <div className={styles.detailCard}>
        <h3>Documents &amp; Expiry Dates</h3>

        <div className={styles.documentRow}>
          <div className={styles.documentInfo}>
            <span className={styles.documentLabel}>🛡️ Vehicle Insurance</span>
            <span className={`${styles.detailValue} ${getExpiryClass(vehicleData.insurance_expiry_date)}`}>
              Expires: {formatDate(vehicleData.insurance_expiry_date)}
              {getExpiryLabel(vehicleData.insurance_expiry_date)}
            </span>
          </div>
          <div className={styles.documentUpload}>
            {groupedDocs.VEHICLE_INSURANCE?.map((doc) => (
              <a
                key={doc.id}
                href={`/api/files/${doc.id}/view`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.uploadedFile}
              >
                📄 {doc.file_name || 'Insurance Document'}
                {doc.expiry_date ? ` (File Expiry: ${formatDate(doc.expiry_date)})` : ''}
              </a>
            ))}
            {!groupedDocs.VEHICLE_INSURANCE?.length && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No file uploaded</span>
            )}
          </div>
        </div>

        <div className={styles.documentRow}>
          <div className={styles.documentInfo}>
            <span className={styles.documentLabel}>📋 Road License</span>
            <span className={`${styles.detailValue} ${getExpiryClass(vehicleData.road_license_expiry_date)}`}>
              Expires: {formatDate(vehicleData.road_license_expiry_date)}
              {getExpiryLabel(vehicleData.road_license_expiry_date)}
            </span>
          </div>
          <div className={styles.documentUpload}>
            {groupedDocs.ROAD_LICENSE?.map((doc) => (
              <a
                key={doc.id}
                href={`/api/files/${doc.id}/view`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.uploadedFile}
              >
                📄 {doc.file_name || 'Road License'}
                {doc.expiry_date ? ` (File Expiry: ${formatDate(doc.expiry_date)})` : ''}
              </a>
            ))}
            {!groupedDocs.ROAD_LICENSE?.length && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No file uploaded</span>
            )}
          </div>
        </div>

        <div className={styles.documentRow}>
          <div className={styles.documentInfo}>
            <span className={styles.documentLabel}>📖 Logbook</span>
            <span className={styles.documentHint}>Vehicle registration logbook</span>
          </div>
          <div className={styles.documentUpload}>
            {groupedDocs.LOGBOOK?.map((doc) => (
              <a
                key={doc.id}
                href={`/api/files/${doc.id}/view`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.uploadedFile}
              >
                📄 {doc.file_name || 'Logbook'}
                {doc.expiry_date ? ` (File Expiry: ${formatDate(doc.expiry_date)})` : ''}
              </a>
            ))}
            {!groupedDocs.LOGBOOK?.length && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No file uploaded</span>
            )}
          </div>
        </div>

        <div className={styles.documentRow}>
          <div className={styles.documentInfo}>
            <span className={styles.documentLabel}>📁 Other Documents</span>
          </div>
          <div className={styles.documentUpload}>
            {groupedDocs.OTHER?.map((doc) => (
              <a
                key={doc.id}
                href={`/api/files/${doc.id}/view`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.uploadedFile}
              >
                📄 {doc.file_name || 'Document'}
                {doc.expiry_date ? ` (File Expiry: ${formatDate(doc.expiry_date)})` : ''}
              </a>
            ))}
            {!groupedDocs.OTHER?.length && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No file uploaded</span>
            )}
          </div>
        </div>

        {Object.keys(groupedDocs).some((k) => !DOC_TYPE_LABELS[k]) && (
          <p className="text-muted" style={{ marginTop: '0.75rem' }}>
            Some documents may appear under unexpected categories.
          </p>
        )}
      </div>

      {vehicleData.notes && (
        <div className={styles.detailCard}>
          <h3>Notes</h3>
          <p className={styles.notesContent}>{vehicleData.notes}</p>
        </div>
      )}
    </FleetShell>
  );
}
