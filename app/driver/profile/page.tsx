import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import PushNotificationToggle from '@/components/shared/PushNotificationToggle';
import ChangePasswordForm from '@/components/shared/ChangePasswordForm';
import type { Driver, Vehicle, User } from '@/lib/types/database';
import styles from './profile.module.css';

interface DriverWithRelations extends Driver {
  users: User | null;
  vehicles: Vehicle | null;
}

interface FileRecord {
  id: string;
  type: string;
  file_url: string;
  file_name: string | null;
  expiry_date: string | null;
  uploaded_at: string;
}

/**
 * Driver Profile Page - View own profile details
 */
export default async function DriverProfilePage() {
  const user = await requireRole(['driver', 'admin', 'staff']);
  const supabase = await createClient();

  const timeZone = process.env.NEXT_PUBLIC_TIME_ZONE || 'Europe/Malta';

  // Get driver record for current user
  const { data: driver, error } = await supabase
    .from('drivers')
    .select(`
      *,
      users:user_id (id, email, full_name),
      vehicles:assigned_vehicle_id (id, registration_number, make, model)
    `)
    .eq('user_id', user.id)
    .single();

  if (error || !driver) {
    // If admin/staff viewing without driver profile, redirect
    if (user.role !== 'driver') {
      redirect('/admin');
    }
    return (
      <DashboardLayout user={user} variant="driver" title="My Profile">
        <div className={styles.errorCard}>
          <h3>Profile Not Found</h3>
          <p>Your driver profile has not been set up yet. Please contact an administrator.</p>
        </div>
      </DashboardLayout>
    );
  }

  const driverData = driver as DriverWithRelations;

  // Fetch documents/attachments for this driver
  const { data: documents } = await supabase
    .from('files')
    .select('*')
    .eq('owner_type', 'driver')
    .eq('owner_id', driverData.id)
    .order('uploaded_at', { ascending: false });

  // Fetch recent shifts
  const { data: recentShifts } = await supabase
    .from('driver_shifts')
    .select('id, start_time, end_time, starting_mileage, ending_mileage')
    .eq('driver_id', driverData.id)
    .order('start_time', { ascending: false })
    .limit(5);

  const { data: assignmentRows } = await supabase
    .from('driver_vehicle_assignments')
    .select(`
      vehicles:vehicle_id (id, registration_number, make, model)
    `)
    .eq('driver_id', driverData.id);

  const normalizeVehicle = (v: unknown): { id: string; registration_number: string; make: string; model: string } | null => {
    if (!v) return null;
    if (Array.isArray(v)) return (v[0] as { id: string; registration_number: string; make: string; model: string } | undefined) || null;
    return v as { id: string; registration_number: string; make: string; model: string };
  };

  const assignedVehicles = (assignmentRows || [])
    .map((r: unknown) => normalizeVehicle((r as { vehicles?: unknown }).vehicles))
    .filter((v): v is { id: string; registration_number: string; make: string; model: string } => Boolean(v));

  // Fetch next scheduled shift from roster
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { data: nextShiftData } = await supabase
    .from('roster_assignments')
    .select(`
      assignment_date,
      vehicles:vehicle_id (registration_number, make, model),
      rosters:roster_id (title, status)
    `)
    .eq('driver_id', driverData.id)
    .gte('assignment_date', today.toISOString().split('T')[0])
    .order('assignment_date', { ascending: true })
    .limit(1)
    .single();

  // Type the next shift data properly
  interface NextShiftData {
    assignment_date: string;
    vehicles: { registration_number: string; make: string; model: string } | null;
    rosters: { title: string; status: string } | null;
  }
  const typedNextShift = nextShiftData as NextShiftData | null;
  const nextShift = typedNextShift?.rosters?.status === 'published' ? typedNextShift : null;

  // Helper functions
  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'Not set';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getExpiryStatus = (dateStr: string | null): { class: string; label: string } => {
    if (!dateStr) return { class: '', label: '' };
    const date = new Date(dateStr);
    const now = new Date();
    const thirtyDays = new Date();
    thirtyDays.setDate(now.getDate() + 30);
    
    if (date < now) return { class: styles.expiryDanger, label: 'Expired' };
    if (date <= thirtyDays) return { class: styles.expiryWarning, label: 'Expiring soon' };
    return { class: styles.expiryOk, label: 'Valid' };
  };

  const getDocumentsByType = (type: string): FileRecord[] => {
    return (documents || []).filter((doc: FileRecord) => doc.type === type);
  };

  const documentTypes = [
    { key: 'ID_CARD', label: 'ID Card', expiry: driverData.id_card_expiry_date },
    { key: 'DRIVING_LICENSE', label: 'Driving License', expiry: driverData.driving_license_expiry_date },
    { key: 'POLICE_CONDUCT', label: 'Police Conduct', expiry: driverData.police_conduct_expiry_date },
    { key: 'TAG_LICENSE', label: 'TAG License', expiry: driverData.tag_license_expiry_date },
  ];

  return (
    <DashboardLayout user={user} variant="driver" title="My Profile">
      <div className={styles.container}>
        {/* Profile Header */}
        <div className={styles.profileHeader}>
          <div className={styles.avatar}>
            {driverData.full_name.charAt(0).toUpperCase()}
          </div>
          <div className={styles.profileInfo}>
            <h2 className={styles.name}>{driverData.full_name}</h2>
            <span className={`${styles.statusBadge} ${driverData.status === 'active' ? styles.active : styles.inactive}`}>
              {driverData.status}
            </span>
          </div>
        </div>

        {/* Next Shift Widget */}
        <div className={`${styles.card} ${styles.nextShiftCard}`}>
          <div className={styles.cardHeader}>
            <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M3 10h18M9 4v6M15 4v6" />
            </svg>
            <h3>Next Scheduled Shift</h3>
          </div>
          <div className={styles.cardContent}>
            {nextShift ? (
              <div className={styles.nextShiftContent}>
                <div className={styles.nextShiftDate}>
                  <span className={styles.nextShiftDay}>
                    {new Date(nextShift.assignment_date).toLocaleDateString('en-GB', { weekday: 'long' })}
                  </span>
                  <span className={styles.nextShiftFullDate}>
                    {new Date(nextShift.assignment_date).toLocaleDateString('en-GB', { 
                      day: 'numeric', 
                      month: 'long',
                      year: 'numeric'
                    })}
                  </span>
                </div>
                {nextShift.vehicles && (
                  <div className={styles.nextShiftVehicle}>
                    <span className={styles.vehicleLabel}>Vehicle</span>
                    <span className={styles.vehicleValue}>
                      {nextShift.vehicles.registration_number} - {nextShift.vehicles.make} {nextShift.vehicles.model}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className={styles.emptyMessage}>No upcoming shifts scheduled</p>
            )}
          </div>
        </div>

        {/* Personal Information */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <h3>Personal Information</h3>
          </div>
          <div className={styles.cardContent}>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Full Name</span>
                <span className={styles.infoValue}>{driverData.full_name}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Email</span>
                <span className={styles.infoValue}>
                  {driverData.users?.email || 'Not linked'}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Phone</span>
                <span className={`${styles.infoValue} ${!driverData.phone ? styles.empty : ''}`}>
                  {driverData.phone || 'Not set'}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Address</span>
                <span className={`${styles.infoValue} ${!driverData.address ? styles.empty : ''}`}>
                  {driverData.address || 'Not set'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Documents & Licenses */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <h3>Documents &amp; Licenses</h3>
          </div>
          <div className={styles.cardContent}>
            <div className={styles.documentsList}>
              {documentTypes.map((docType) => {
                const status = getExpiryStatus(docType.expiry || null);
                const attachments = getDocumentsByType(docType.key);
                
                return (
                  <div key={docType.key} className={styles.documentItem}>
                    <div className={styles.documentInfo}>
                      <span className={styles.documentLabel}>{docType.label}</span>
                      <div className={styles.documentDetails}>
                        <span className={`${styles.expiryDate} ${status.class}`}>
                          {docType.expiry ? (
                            <>
                              Expires: {formatDate(docType.expiry)}
                              {status.label && <span className={styles.expiryBadge}>{status.label}</span>}
                            </>
                          ) : (
                            'Expiry not set'
                          )}
                        </span>
                      </div>
                    </div>
                    <div className={styles.documentAttachments}>
                      {attachments.length > 0 ? (
                        attachments.map((file: FileRecord) => (
                          <a 
                            key={file.id} 
                            href={file.file_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className={styles.attachmentLink}
                          >
                            <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
                              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                            </svg>
                            {file.file_name || 'View Document'}
                          </a>
                        ))
                      ) : (
                        <span className={styles.noAttachment}>No file uploaded</span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* ID Card Number */}
              <div className={styles.documentItem}>
                <div className={styles.documentInfo}>
                  <span className={styles.documentLabel}>ID Card Number</span>
                  <span className={`${styles.documentValue} ${!driverData.id_card_number ? styles.empty : ''}`}>
                    {driverData.id_card_number || 'Not set'}
                  </span>
                </div>
              </div>

              {/* Driving License Number */}
              <div className={styles.documentItem}>
                <div className={styles.documentInfo}>
                  <span className={styles.documentLabel}>Driving License Number</span>
                  <span className={`${styles.documentValue} ${!driverData.driving_license_number ? styles.empty : ''}`}>
                    {driverData.driving_license_number || 'Not set'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Assigned Vehicle */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
              <path d="M5 16l-1.5-4.5a2 2 0 011.5-2.5l1.5-1.5A2 2 0 018 6h8a2 2 0 011.5.5L19 8.5a2 2 0 011.5 2.5L19 16" />
              <circle cx="7" cy="17" r="2" />
              <circle cx="17" cy="17" r="2" />
            </svg>
            <h3>Assigned Vehicle</h3>
          </div>
          <div className={styles.cardContent}>
            {assignedVehicles.length > 0 ? (
              <div className={styles.vehicleInfo}>
                {assignedVehicles.map((v) => (
                  <div key={v.id} className={styles.vehicleCard}>
                    <span className={styles.vehicleReg}>{v.registration_number}</span>
                    <span className={styles.vehicleModel}>{v.make} {v.model}</span>
                  </div>
                ))}
              </div>
            ) : driverData.vehicles ? (
              <div className={styles.vehicleInfo}>
                <div className={styles.vehicleCard}>
                  <span className={styles.vehicleReg}>{driverData.vehicles.registration_number}</span>
                  <span className={styles.vehicleModel}>{driverData.vehicles.make} {driverData.vehicles.model}</span>
                </div>
              </div>
            ) : (
              <p className={styles.emptyMessage}>No vehicle assigned</p>
            )}
          </div>
        </div>

        {/* Recent Shifts */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <h3>Recent Shifts</h3>
          </div>
          <div className={styles.cardContent}>
            {recentShifts && recentShifts.length > 0 ? (
              <div className={styles.shiftsList}>
                {recentShifts.map(shift => (
                  <div key={shift.id} className={styles.shiftItem}>
                    <div className={styles.shiftDate}>
                      <span className={styles.shiftDay}>
                        {new Date(shift.start_time).toLocaleDateString('en-GB', { timeZone, weekday: 'short' })}
                      </span>
                      <span className={styles.shiftFullDate}>
                        {new Date(shift.start_time).toLocaleDateString('en-GB', { timeZone, day: '2-digit', month: 'short' })}
                      </span>
                    </div>
                    <div className={styles.shiftDetails}>
                      <span className={styles.shiftTime}>
                        {new Date(shift.start_time).toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' })}
                        {' → '}
                        {shift.end_time 
                          ? new Date(shift.end_time).toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' })
                          : <span className={styles.activeShift}>Active</span>
                        }
                      </span>
                      <span className={styles.shiftMileage}>
                        {shift.starting_mileage.toLocaleString()} km
                        {shift.ending_mileage && ` → ${shift.ending_mileage.toLocaleString()} km`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.emptyMessage}>No shifts recorded yet.</p>
            )}
          </div>
        </div>

        {/* Notification Settings */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <h3>Notification Settings</h3>
          </div>
          <div className={styles.cardContent}>
            <PushNotificationToggle />
          </div>
        </div>

        {/* Change Password */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <h3>Change Password</h3>
          </div>
          <div className={styles.cardContent}>
            <ChangePasswordForm />
          </div>
        </div>

        {/* Account Info */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <h3>Account Information</h3>
          </div>
          <div className={styles.cardContent}>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Member Since</span>
                <span className={styles.infoValue}>
                  {new Date(driverData.created_at).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric'
                  })}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Last Updated</span>
                <span className={styles.infoValue}>
                  {new Date(driverData.updated_at).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric'
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
