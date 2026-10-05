import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetIcon from '@/components/fleet/FleetIcon';
import DeleteStaffButton from '@/components/admin/DeleteStaffButton';
// Same look as the driver page (hero card + sectioned field grid).
import styles from '@/components/admin/DriverProfile.module.css';

interface StaffDetailPageProps {
  params: Promise<{ id: string }>;
}

const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || 'Europe/Malta';

/** "7 Apr 2026, 22:58" in the fleet's time zone. */
function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-GB', {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Staff Detail Page
 */
export default async function StaffDetailPage({ params }: StaffDetailPageProps) {
  const { id } = await params;
  const user = await requireRole(['admin']);
  const supabase = await createClient();

  // Scope to THIS fleet's members (users has no organization_id — join via memberships).
  const { data: orgMembers } = await supabase
    .from('memberships')
    .select('user_id, role, also_staff, created_at')
    .eq('organization_id', user.organization_id);
  const memberIds = (orgMembers || []).map((m) => m.user_id);

  const { data: staff, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .in('id', memberIds)
    .or('role.eq.staff,also_staff.eq.true')
    .single();

  if (error || !staff) {
    notFound();
  }

  // Role in THIS fleet comes from the membership — users.role is a legacy global.
  const membership = orgMembers?.find((m) => m.user_id === staff.id);
  const role = membership?.role ?? staff.role;
  const isDualRoleStaff = role === 'driver' && (membership?.also_staff || staff.also_staff);
  const roleLabel = role === 'admin' ? 'Administrator' : isDualRoleStaff ? 'Driver + Staff' : 'Staff';
  const name = staff.full_name || staff.email;

  return (
    <FleetShell user={user} title="Staff Details">
      <div className={styles.container}>
        <div className={styles.header}>
          <Link href="/fleet/staff" className={styles.backLink}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            Back to staff
          </Link>
          <div className={styles.heroCard} style={{ flexWrap: 'wrap' }}>
            <div className={styles.avatar}>{initialsOf(name)}</div>
            <div className={styles.heroInfo}>
              <h1 className={styles.heroName}>{name}</h1>
              <div className={styles.heroBadges}>
                <span className={`badge ${role === 'admin' ? 'badge-success' : 'badge-info'}`}>{roleLabel}</span>
                {staff.full_name && <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{staff.email}</span>}
              </div>
            </div>
            <div className={styles.heroActions}>
              <Link href={`/fleet/staff/${staff.id}/edit`} className={styles.backLink} style={{ alignSelf: 'auto' }}>
                <FleetIcon name="pencil" size={14} />
                Edit
              </Link>
              <DeleteStaffButton staffId={staff.id} staffName={name} isDualRole={isDualRoleStaff} />
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={`${styles.sectionIcon} ${styles.sectionIconBlue}`}><FleetIcon name="staff" size={16} /></div>
            <h3 className={styles.sectionTitle}>Account</h3>
          </div>
          <div className={styles.sectionBody}>
            <div className={styles.fieldGrid}>
              <ReadOnlyField label="Full name" value={staff.full_name} />
              <ReadOnlyField label="Email" value={staff.email} />
              <ReadOnlyField label="Role in this fleet" value={roleLabel} />
              <ReadOnlyField label="Joined this fleet" value={formatDateTime(membership?.created_at ?? staff.created_at)} mono />
              <ReadOnlyField label="Profile last updated" value={formatDateTime(staff.updated_at)} mono />
              <ReadOnlyField label="Account created" value={formatDateTime(staff.created_at)} mono />
            </div>
          </div>
        </div>
      </div>
    </FleetShell>
  );
}

function ReadOnlyField({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    // The driver page's fields are click-to-edit; these aren't (Edit opens the form).
    <div className={styles.field} style={{ cursor: 'default' }}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.fieldValue}>
        {value ? <span className={mono ? 'mono tnum' : undefined}>{value}</span> : <span className={styles.fieldEmpty}>Not set</span>}
      </div>
    </div>
  );
}
