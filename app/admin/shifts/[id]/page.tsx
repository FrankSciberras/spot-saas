import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import ClickableImage from '@/components/shared/ClickableImage';
import styles from '@/components/admin/AdminForms.module.css';
import shiftStyles from '../shifts.module.css';

interface ShiftWithRelations {
  id: string;
  driver_id: string;
  vehicle_id: string;
  name: string;
  starting_mileage: number;
  start_time: string;
  end_time: string | null;
  front_image_url: string | null;
  left_image_url: string | null;
  right_image_url: string | null;
  back_image_url: string | null;
  dashcam_checked: boolean;
  car_internal_checked: boolean;
  notes: string | null;
  created_at: string;
  drivers: { id: string; full_name: string } | null;
  vehicles: { id: string; registration_number: string; make: string; model: string } | null;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Shift Detail Page - View details of a specific driver shift (Go Online record)
 */
export default async function ShiftDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireRole(['admin', 'staff']);
  const supabase = await createClient();

  const timeZone = process.env.NEXT_PUBLIC_TIME_ZONE || 'Europe/Malta';

  const { data: shift, error } = await supabase
    .from('driver_shifts')
    .select(`
      *,
      drivers:driver_id (id, full_name),
      vehicles:vehicle_id (id, registration_number, make, model)
    `)
    .eq('id', id)
    .single();

  if (error || !shift) {
    notFound();
  }

  const shiftData = shift as ShiftWithRelations;

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-GB', {
      timeZone,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      timeZone,
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isActiveShift = !shiftData.end_time;
  const hasImages = shiftData.front_image_url || shiftData.left_image_url || 
                    shiftData.right_image_url || shiftData.back_image_url;

  return (
    <DashboardLayout user={user} variant="admin" title="Shift Details">
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <Link href="/admin/shifts" className={styles.backButton} aria-label="Back to shifts">
            <span>←</span>
          </Link>
          <div className={styles.pageTitleMain}>
            <h2>Shift Details</h2>
            <span className={styles.subtitle}>
              <span className={`badge ${isActiveShift ? 'badge-success' : 'badge-secondary'}`}>
                {isActiveShift ? 'Active' : 'Completed'}
              </span>
              <span style={{ marginLeft: '8px', color: 'var(--text-muted)' }}>
                {formatDate(shiftData.start_time)}
              </span>
            </span>
          </div>
        </div>
        <div className={styles.pageActions}>
          <Link href={`/admin/shifts/${shiftData.id}/edit`} className="btn btn-primary">
            Edit Shift
          </Link>
        </div>
      </div>

      {/* Quick Stats */}
      <div className={styles.statsRow}>
        <div className={styles.statItem}>
          <div className="value">
            {shiftData.drivers?.full_name || 'Unknown'}
          </div>
          <div className="label">Driver</div>
        </div>

        <div className={styles.statItem}>
          <div className="value">
            {shiftData.vehicles?.registration_number || 'Unknown'}
          </div>
          <div className="label">Vehicle</div>
        </div>

        <div className={styles.statItem}>
          <div className="value">
            {shiftData.starting_mileage.toLocaleString()} km
          </div>
          <div className="label">Starting Mileage</div>
        </div>

        <div className={styles.statItem}>
          <div className="value">
            {isActiveShift ? 'In Progress' : 'Ended'}
          </div>
          <div className="label">Status</div>
        </div>
      </div>

      {/* Shift Information */}
      <div className={styles.detailCard}>
        <h3>Shift Information</h3>
        <div className={styles.detailGrid}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Name on Shift</span>
            <span className={styles.detailValue}>{shiftData.name}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Driver</span>
            <span className={styles.detailValue}>
              {shiftData.drivers ? (
                <Link href={`/admin/drivers/${shiftData.drivers.id}`} className={styles.detailLink}>
                  {shiftData.drivers.full_name}
                </Link>
              ) : (
                <span className={styles.empty}>Unknown</span>
              )}
            </span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Start Time</span>
            <span className={styles.detailValue}>{formatDateTime(shiftData.start_time)}</span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>End Time</span>
            <span className={`${styles.detailValue} ${!shiftData.end_time ? styles.empty : ''}`}>
              {shiftData.end_time ? formatDateTime(shiftData.end_time) : (
                <span className="badge badge-success">Active</span>
              )}
            </span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Starting Mileage</span>
            <span className={styles.detailValue}>{shiftData.starting_mileage.toLocaleString()} km</span>
          </div>
        </div>
      </div>

      {/* Vehicle Information */}
      <div className={styles.detailCard}>
        <h3>Vehicle Information</h3>
        <div className={styles.detailGrid}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Registration Number</span>
            <span className={styles.detailValue}>
              {shiftData.vehicles ? (
                <Link href={`/admin/vehicles/${shiftData.vehicles.id}`} className={styles.detailLink}>
                  {shiftData.vehicles.registration_number}
                </Link>
              ) : (
                <span className={styles.empty}>Unknown</span>
              )}
            </span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Make & Model</span>
            <span className={`${styles.detailValue} ${!shiftData.vehicles ? styles.empty : ''}`}>
              {shiftData.vehicles 
                ? `${shiftData.vehicles.make} ${shiftData.vehicles.model}` 
                : 'Unknown'}
            </span>
          </div>
        </div>
      </div>

      {/* Pre-Shift Checks */}
      <div className={styles.detailCard}>
        <h3>Pre-Shift Checks</h3>
        <div className={styles.detailGrid}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Dashcam Check</span>
            <span className={styles.detailValue}>
              <span className={`badge ${shiftData.dashcam_checked ? 'badge-success' : 'badge-secondary'}`}>
                {shiftData.dashcam_checked ? '✓ Checked' : '✗ Not Checked'}
              </span>
            </span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Car Internal Check</span>
            <span className={styles.detailValue}>
              <span className={`badge ${shiftData.car_internal_checked ? 'badge-success' : 'badge-secondary'}`}>
                {shiftData.car_internal_checked ? '✓ Checked' : '✗ Not Checked'}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Vehicle Images */}
      {hasImages && (
        <div className={styles.detailCard}>
          <h3>Vehicle Images</h3>
          <p className="text-muted" style={{ marginBottom: '16px', fontSize: 'var(--font-sm)' }}>
            Click on an image to view fullscreen
          </p>
          <div className={shiftStyles.imageGrid}>
            {shiftData.front_image_url && (
              <ClickableImage
                src={shiftData.front_image_url}
                alt="Front of vehicle"
                className={shiftStyles.imageItem}
                labelClassName={shiftStyles.imageLabel}
                label="Front"
              />
            )}
            {shiftData.back_image_url && (
              <ClickableImage
                src={shiftData.back_image_url}
                alt="Back of vehicle"
                className={shiftStyles.imageItem}
                labelClassName={shiftStyles.imageLabel}
                label="Back"
              />
            )}
            {shiftData.left_image_url && (
              <ClickableImage
                src={shiftData.left_image_url}
                alt="Left side of vehicle"
                className={shiftStyles.imageItem}
                labelClassName={shiftStyles.imageLabel}
                label="Left Side"
              />
            )}
            {shiftData.right_image_url && (
              <ClickableImage
                src={shiftData.right_image_url}
                alt="Right side of vehicle"
                className={shiftStyles.imageItem}
                labelClassName={shiftStyles.imageLabel}
                label="Right Side"
              />
            )}
          </div>
        </div>
      )}

      {/* No Images Placeholder */}
      {!hasImages && (
        <div className={styles.detailCard}>
          <h3>Vehicle Images</h3>
          <p className="text-muted">No vehicle images were uploaded for this shift.</p>
        </div>
      )}

      {/* Notes */}
      {shiftData.notes && (
        <div className={styles.detailCard}>
          <h3>Notes</h3>
          <p className={styles.notesContent}>{shiftData.notes}</p>
        </div>
      )}

      {/* Record Information */}
      <div className={styles.detailCard}>
        <h3>Record Information</h3>
        <div className={styles.detailGrid}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Shift ID</span>
            <span className={styles.detailValue} style={{ fontFamily: 'monospace', fontSize: 'var(--font-xs)' }}>
              {shiftData.id}
            </span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Created At</span>
            <span className={styles.detailValue}>
              {formatDateTime(shiftData.created_at)}
            </span>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
