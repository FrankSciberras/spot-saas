import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import PushNotificationToggle from '@/components/shared/PushNotificationToggle';
import ChangePasswordForm from '@/components/shared/ChangePasswordForm';
import styles from './profile.module.css';

/**
 * Staff Profile Page - View own profile and manage notifications
 */
export default async function StaffProfilePage() {
  const user = await requireRole(['staff']);
  const supabase = await createClient();

  // Get staff user details
  const { data: staffUser } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  return (
    <DashboardLayout user={user} variant="admin" title="My Profile">
      <div className={styles.container}>
        {/* Profile Header */}
        <div className={styles.profileHeader}>
          <div className={styles.avatar}>
            {(staffUser?.full_name || staffUser?.email || '?').charAt(0).toUpperCase()}
          </div>
          <div className={styles.profileInfo}>
            <h2 className={styles.name}>{staffUser?.full_name || staffUser?.email}</h2>
            <span className={styles.roleBadge}>Staff</span>
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
                <span className={styles.infoValue}>
                  {staffUser?.full_name || <span className={styles.empty}>Not set</span>}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Email</span>
                <span className={styles.infoValue}>{staffUser?.email}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Role</span>
                <span className={styles.infoValue}>Staff</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Member Since</span>
                <span className={styles.infoValue}>
                  {staffUser?.created_at 
                    ? new Date(staffUser.created_at).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric'
                      })
                    : '-'
                  }
                </span>
              </div>
            </div>
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
            <p className={styles.helpText}>
              Enable push notifications to receive instant updates about rosters, shifts, and other important alerts.
            </p>
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
      </div>
    </DashboardLayout>
  );
}
