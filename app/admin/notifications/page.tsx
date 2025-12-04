import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import NotificationManager from '@/components/admin/NotificationManager';
import styles from './notifications.module.css';

export default async function NotificationsPage() {
  const user = await requireRole(['admin']);
  const supabase = await createClient();

  // Get notification rules
  const { data: rules } = await supabase
    .from('notification_rules')
    .select('*')
    .order('trigger_type')
    .order('name');

  // Get recent notification logs
  const { data: logs } = await supabase
    .from('notification_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  // Get drivers for recipient selection
  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, full_name, status')
    .eq('status', 'active')
    .order('full_name');

  return (
    <DashboardLayout user={user} variant="admin" title="Notifications">
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2>Notification Management</h2>
            <p className={styles.subtitle}>
              Manage automated notifications and send custom messages
            </p>
          </div>
        </div>

        <NotificationManager 
          initialRules={rules || []}
          initialLogs={logs || []}
          drivers={drivers || []}
        />
      </div>
    </DashboardLayout>
  );
}
