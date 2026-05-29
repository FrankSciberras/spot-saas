import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import type { AuditLogEntry } from '@/lib/types/database';
import styles from './audit-log.module.css';

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.join(', ');
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getSearchValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] || '';
  }

  return value || '';
}

interface AuditLogPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AuditLogPage({ searchParams }: AuditLogPageProps) {
  const user = await requireRole(['admin']);
  const supabase = await createClient();
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const selectedStaffId = getSearchValue(resolvedSearchParams.staff);
  const fromDate = getSearchValue(resolvedSearchParams.from);
  const toDate = getSearchValue(resolvedSearchParams.to);
  const queryText = getSearchValue(resolvedSearchParams.q).trim();

  const { data: staffOptions } = await supabase
    .from('users')
    .select('id, full_name, email')
    .or('role.eq.staff,also_staff.eq.true')
    .order('full_name', { ascending: true });

  let query = supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (selectedStaffId) {
    query = query.eq('actor_user_id', selectedStaffId);
  }

  if (fromDate) {
    query = query.gte('created_at', `${fromDate}T00:00:00.000Z`);
  }

  if (toDate) {
    query = query.lte('created_at', `${toDate}T23:59:59.999Z`);
  }

  if (queryText) {
    const escapedQuery = queryText.replace(/,/g, ' ');
    query = query.or(`summary.ilike.%${escapedQuery}%,entity_type.ilike.%${escapedQuery}%,entity_id.ilike.%${escapedQuery}%,actor_name.ilike.%${escapedQuery}%,actor_email.ilike.%${escapedQuery}%`);
  }

  const { data: entries, error } = await query;

  const logs = (entries || []) as AuditLogEntry[];
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const stats = {
    total: logs.length,
    today: logs.filter((entry) => new Date(entry.created_at).getTime() >= dayAgo).length,
    week: logs.filter((entry) => new Date(entry.created_at).getTime() >= weekAgo).length,
    deletions: logs.filter((entry) => entry.action === 'delete').length,
  };

  return (
    <FleetShell user={user} title="Audit Log">
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2>Audit Log</h2>
            <p className={styles.subtitle}>Recent create, update, and delete actions performed by staff members.</p>
          </div>
        </div>

        <form className={styles.filtersCard}>
          <div className={styles.filtersGrid}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Staff member</span>
              <select name="staff" defaultValue={selectedStaffId} className={styles.fieldControl}>
                <option value="">All staff</option>
                {(staffOptions || []).map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.full_name || staff.email}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>From date</span>
              <input type="date" name="from" defaultValue={fromDate} className={styles.fieldControl} />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>To date</span>
              <input type="date" name="to" defaultValue={toDate} className={styles.fieldControl} />
            </label>

            <label className={`${styles.field} ${styles.searchField}`}>
              <span className={styles.fieldLabel}>Search</span>
              <input
                type="search"
                name="q"
                defaultValue={queryText}
                placeholder="Search summary, staff, entity, or ID"
                className={styles.fieldControl}
              />
            </label>
          </div>

          <div className={styles.filterActions}>
            <button type="submit" className="btn btn-primary">Apply Filters</button>
            <a href="/fleet/audit-log" className="btn btn-secondary">Clear</a>
          </div>
        </form>

        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.total}</div>
            <div className={styles.statLabel}>Recent Entries</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.today}</div>
            <div className={styles.statLabel}>Last 24 Hours</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.week}</div>
            <div className={styles.statLabel}>Last 7 Days</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{stats.deletions}</div>
            <div className={styles.statLabel}>Deletes</div>
          </div>
        </div>

        {error ? (
          <div className="alert alert-danger">Failed to load audit log: {error.message}</div>
        ) : logs.length === 0 ? (
          <div className={styles.emptyState}>
            <h3>No audit entries yet</h3>
            <p>Staff changes will appear here once actions are recorded.</p>
          </div>
        ) : (
          <div className={styles.logList}>
            {logs.map((entry) => {
              const badgeClass =
                entry.action === 'create'
                  ? styles.badgeCreate
                  : entry.action === 'delete'
                    ? styles.badgeDelete
                    : styles.badgeUpdate;

              return (
                <div key={entry.id} className={styles.logCard}>
                  <div className={styles.logTop}>
                    <div className={styles.logTitle}>
                      <span className={`${styles.badge} ${badgeClass}`}>{entry.action}</span>
                      <span className={`${styles.badge} ${styles.entityBadge}`}>{entry.entity_type}</span>
                      <span>{entry.summary}</span>
                    </div>
                    <div className={styles.logTime}>
                      {new Date(entry.created_at).toLocaleString()}
                    </div>
                  </div>

                  <div className={styles.actorLine}>
                    {entry.actor_name || entry.actor_email || 'Unknown user'} ({entry.actor_role})
                  </div>

                  <div className={styles.summary}>{entry.entity_id ? `Target ID: ${entry.entity_id}` : 'No target ID recorded'}</div>

                  {entry.details && Object.keys(entry.details).length > 0 && (
                    <div className={styles.detailsGrid}>
                      {Object.entries(entry.details).map(([key, value]) => (
                        <div key={key} className={styles.detailItem}>
                          <div className={styles.detailLabel}>{key.replace(/_/g, ' ')}</div>
                          <div className={styles.detailValue}>{formatValue(value)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </FleetShell>
  );
}
