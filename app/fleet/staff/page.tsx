import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import StaffWorkspace, { type StaffItem, type RoleBreakdown, type StaffStatus } from '@/components/fleet/staff/StaffWorkspace';

const PALETTE = ['#5b8dff', '#3ecf8e', '#a78bfa', '#f5b54a', '#f472b6', '#f06464', '#38bdf8', '#facc15'];

function initialsOf(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function roleLabel(role: string, alsoStaff: boolean): string {
  if (role === 'admin') return 'Administrator';
  if (role === 'driver' && alsoStaff) return 'Driver + Staff';
  if (role === 'staff') return 'Staff';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function roleTone(role: string): string {
  if (role === 'admin') return 'var(--accent)';
  if (role === 'driver') return 'var(--warn)';
  return 'var(--pos)';
}

export default async function StaffPage() {
  const user = await requireRole(['admin', 'staff']);
  const supabase = await createClient();
  const isAdmin = user.role === 'admin';

  const { data: staffData } = await supabase
    .from('users')
    .select('id, full_name, email, role, also_staff, created_at')
    .or('role.eq.staff,also_staff.eq.true')
    .order('full_name');

  const rows = (staffData || []) as any[];

  const members: StaffItem[] = rows.map((s, i) => {
    const label = roleLabel(s.role, !!s.also_staff);
    const status: StaffStatus = 'active';
    const joined = s.created_at ? new Date(s.created_at) : null;
    return {
      id: s.id,
      name: s.full_name || s.email || 'Unknown',
      initials: initialsOf(s.full_name || s.email || '?'),
      color: PALETTE[i % PALETTE.length],
      role: label,
      roleTone: roleTone(s.role),
      status,
      lastActive: joined ? `Joined ${joined.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : '—',
      email: s.email || '',
    };
  });

  // Role breakdown
  const roleMap = new Map<string, { n: number; tone: string; perms: string }>();
  const PERMS: Record<string, string> = {
    Administrator: 'Full access to all areas',
    Staff: 'Operations & dashboard access',
    'Driver + Staff': 'Driver portal + operations',
  };
  for (const m of members) {
    const cur = roleMap.get(m.role) || { n: 0, tone: m.roleTone, perms: PERMS[m.role] || 'Operations access' };
    cur.n += 1;
    roleMap.set(m.role, cur);
  }
  const roles: RoleBreakdown[] = Array.from(roleMap.entries()).map(([role, v]) => ({ role, n: v.n, tone: v.tone, perms: v.perms }));

  return (
    <FleetShell user={user} title="Staff">
      <StaffWorkspace members={members} roles={roles} canManage={isAdmin} />
    </FleetShell>
  );
}
