import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import RostersList from '@/components/admin/RostersList';
import Link from 'next/link';
import styles from './rosters.module.css';

export default async function RostersPage() {
  const user = await requireRole(['admin', 'staff']);
  const supabase = await createClient();

  const { data: rosters } = await supabase
    .from('rosters')
    .select('*')
    .order('week_start', { ascending: false });

  return (
    <DashboardLayout user={user} variant="admin" title="Rosters">
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.subtitle}>Weekly Driver Schedules</h2>
            <p className={styles.description}>Create and manage weekly rosters for your fleet</p>
          </div>
          <Link href="/admin/rosters/new" className={styles.createBtn}>
            <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Roster
          </Link>
        </div>

        {!rosters || rosters.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" fill="none">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 10h18M9 4v6M15 4v6" />
              </svg>
            </div>
            <h3>No rosters yet</h3>
            <p>Create your first weekly roster to schedule drivers</p>
            <Link href="/admin/rosters/new" className={styles.createBtn}>
              Create First Roster
            </Link>
          </div>
        ) : (
          <RostersList rosters={rosters} />
        )}
      </div>
    </DashboardLayout>
  );
}
