import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import NotificationManager from '@/components/admin/NotificationManager';
import RunRulesButton from './RunRulesButton';
import styles from './notifications.module.css';

export default async function NotificationsPage() {
  const user = await requireRole(['admin']);
  return (
    <FleetShell user={user} title="Notifications">
      <Suspense fallback={<FleetPageSkeleton variant="list" />}>
        <NotificationsContent />
      </Suspense>
    </FleetShell>
  );
}

async function NotificationsContent() {
  const supabase = await createClient();

  // Get notification rules
  const { data: rules } = await supabase
    .from('notification_rules')
    .select('*')
    .order('trigger_type')
    .order('name');

  // Get recent notification logs from notification_log table
  const { data: logEntries } = await supabase
    .from('notification_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  // Also get recent notifications from notifications table (actual sent notifications)
  const { data: recentNotifications } = await supabase
    .from('notifications')
    .select('id, title, body, type, created_at, read_at, action_url')
    .order('created_at', { ascending: false })
    .limit(30);

  // Combine both sources for history, converting notifications to log format
  const notificationLogs = (recentNotifications || []).map(n => ({
    id: n.id,
    channel: 'app',
    title: n.title,
    body: n.body,
    status: n.read_at ? 'read' : 'sent',
    created_at: n.created_at,
    metadata: { type: n.type, action_url: n.action_url },
  }));

  // Merge and sort by date, remove duplicates by title+date
  const allLogs = [...(logEntries || []), ...notificationLogs]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 30);

  const logs = allLogs;

  // Get drivers for recipient selection
  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, full_name, status')
    .eq('status', 'active')
    .order('full_name');

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2>Notification Management</h2>
          <p className={styles.subtitle}>
            Manage automated notifications and send custom messages
          </p>
        </div>
        <RunRulesButton />
      </div>

      <NotificationManager
        initialRules={rules || []}
        initialLogs={logs || []}
        drivers={drivers || []}
      />
    </div>
  );
}
