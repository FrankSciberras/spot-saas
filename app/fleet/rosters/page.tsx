import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import RostersWorkspace, { type RosterItem } from '@/components/fleet/rosters/RostersWorkspace';

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default async function RostersPage() {
  const user = await requireRole(['admin', 'staff']);
  const supabase = await createClient();
  const isAdmin = user.role === 'admin';

  const { data } = await supabase
    .from('rosters')
    .select('id, title, week_start, week_end, status, created_at, published_at')
    .order('week_start', { ascending: false });

  const rows = (data || []) as any[];

  const rosters: RosterItem[] = rows.map((r) => ({
    id: r.id,
    title: r.title || fmtDate(r.week_start),
    range: `${fmtDate(r.week_start)} – ${fmtDate(r.week_end)}`,
    created: fmtDate(r.created_at),
    published: fmtDate(r.published_at),
    status: r.status || 'draft',
  }));

  return (
    <FleetShell user={user} title="Rosters">
      <RostersWorkspace rosters={rosters} canManage={isAdmin} />
    </FleetShell>
  );
}
