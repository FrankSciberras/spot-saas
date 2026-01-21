import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import styles from './shifts.module.css';

// SVG Icons
const PlayIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z"/>
  </svg>
);

const CarIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/>
    <circle cx="6.5" cy="16.5" r="2.5"/>
    <circle cx="16.5" cy="16.5" r="2.5"/>
  </svg>
);

const GaugeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
  </svg>
);

const ClockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
);

const ImageIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
);

/**
 * Driver Shifts List - Modern Mobile-First Design
 */
export default async function DriverShiftsPage() {
  const user = await requireRole(['driver']);
  const supabase = await createClient();

  // Get driver profile
  const { data: driver } = await supabase
    .from('drivers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!driver) {
    return (
      <DashboardLayout user={user} variant="driver" title="My Shifts">
        <div className={styles.container}>
          <div className={styles.alertCard}>
            <span className={styles.alertIcon}>⚠️</span>
            <p>Your driver profile is not set up. Please contact an administrator.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Get shifts
  const { data: shifts, error } = await supabase
    .from('driver_shifts')
    .select(`
      *,
      vehicles:vehicle_id (id, registration_number, make, model)
    `)
    .eq('driver_id', driver.id)
    .order('start_time', { ascending: false });

  const formatDateMain = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const hasImages = (shift: typeof shifts extends (infer T)[] | null ? T : never) => {
    return shift.front_image_url || shift.left_image_url || shift.right_image_url || shift.back_image_url;
  };

  return (
    <DashboardLayout user={user} variant="driver" title="My Shifts">
      <div className={styles.container}>
        <div className={styles.header}>
          <h2>Shift History</h2>
          <Link href="/driver/go-online" className={styles.goOnlineBtn}>
            <PlayIcon />
            Start Shift
          </Link>
        </div>

        {error && (
          <div className={styles.alertCard}>
            <span className={styles.alertIcon}>❌</span>
            <p>Error loading shifts: {error.message}</p>
          </div>
        )}

        {shifts && shifts.length > 0 ? (
          <div className={styles.shiftsList}>
            {shifts.map((shift) => (
              <div key={shift.id} className={styles.shiftCard}>
                <div className={styles.shiftCardHeader}>
                  <div className={styles.shiftDate}>
                    <span className={styles.shiftDateMain}>{formatDateMain(shift.start_time)}</span>
                    <span className={styles.shiftTime}>
                      <ClockIcon /> {formatTime(shift.start_time)}
                    </span>
                  </div>
                  <div className={styles.shiftMileage}>
                    <span className={styles.shiftMileageIcon}><GaugeIcon /></span>
                    {shift.starting_mileage?.toLocaleString()} km
                  </div>
                </div>

                {shift.vehicles && (
                  <div className={styles.shiftVehicle}>
                    <div className={styles.vehicleIcon}>
                      <CarIcon />
                    </div>
                    <div className={styles.vehicleInfo}>
                      <span className={styles.vehicleReg}>{shift.vehicles.registration_number}</span>
                      <span className={styles.vehicleModel}>{shift.vehicles.make} {shift.vehicles.model}</span>
                    </div>
                  </div>
                )}

                <div className={styles.shiftChecks}>
                  <span className={`${styles.checkBadge} ${shift.dashcam_checked ? styles.success : styles.inactive}`}>
                    {shift.dashcam_checked ? '✓' : '✗'} Dashcam
                  </span>
                  <span className={`${styles.checkBadge} ${shift.car_internal_checked ? styles.success : styles.inactive}`}>
                    {shift.car_internal_checked ? '✓' : '✗'} Interior
                  </span>
                </div>

                <div className={styles.shiftImages}>
                  {shift.front_image_url && (
                    <a href={shift.front_image_url} target="_blank" rel="noopener noreferrer" className={styles.imageLink}>
                      <ImageIcon /> Front
                    </a>
                  )}
                  {shift.left_image_url && (
                    <a href={shift.left_image_url} target="_blank" rel="noopener noreferrer" className={styles.imageLink}>
                      <ImageIcon /> Left
                    </a>
                  )}
                  {shift.right_image_url && (
                    <a href={shift.right_image_url} target="_blank" rel="noopener noreferrer" className={styles.imageLink}>
                      <ImageIcon /> Right
                    </a>
                  )}
                  {shift.back_image_url && (
                    <a href={shift.back_image_url} target="_blank" rel="noopener noreferrer" className={styles.imageLink}>
                      <ImageIcon /> Back
                    </a>
                  )}
                  {!hasImages(shift) && (
                    <span className={styles.noImages}>No photos uploaded</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <ClockIcon />
            </div>
            <h3>No shifts yet</h3>
            <p>Start your first shift to see your history here.</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
