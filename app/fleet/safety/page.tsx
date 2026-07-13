import { Suspense, type CSSProperties } from 'react';
import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import FleetIcon from '@/components/fleet/FleetIcon';
import { safetyScore, scoreColor, scoreLabel } from '@/lib/tracking/safety';

interface DriverStats {
  driverId: string;
  name: string;
  distanceKm: number;
  topSpeedKmh: number | null;
  speeding: number;
  harshBrakes: number;
  harshAccels: number;
  harshOther: number;
  score: number;
  hasData: boolean;
}

export default async function SafetyPage() {
  const user = await requireRole(['admin', 'staff']);
  await requireModule(user.organization_id, 'tracking');
  return (
    <FleetShell user={user} title="Driver Safety">
      <Suspense fallback={<FleetPageSkeleton variant="board" stats={0} />}>
        <SafetyContent orgId={user.organization_id} />
      </Suspense>
    </FleetShell>
  );
}

async function SafetyContent({ orgId }: { orgId: string }) {
  const supabase = await createClient();
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();

  const [driversRes, distancesRes, maxSpeedsRes, speedingRes, behaviorRes] = await Promise.all([
    supabase.from('drivers').select('id, full_name').eq('organization_id', orgId).order('full_name'),
    supabase.rpc('driver_distances', { p_since: since }),
    supabase.rpc('driver_max_speeds', { p_since: since }),
    supabase
      .from('speeding_events')
      .select('driver_id')
      .eq('organization_id', orgId)
      .gte('occurred_at', since)
      .range(0, 9999),
    supabase
      .from('driver_behavior_events')
      .select('driver_id, kind')
      .eq('organization_id', orgId)
      .gte('occurred_at', since)
      .range(0, 9999),
  ]);

  const distanceBy = new Map<string, number>(
    ((distancesRes.data || []) as any[]).map((r) => [r.driver_id, Number(r.distance_m) / 1000])
  );
  const topSpeedBy = new Map<string, number>(
    ((maxSpeedsRes.data || []) as any[]).map((r) => [r.driver_id, Math.round(Number(r.max_speed) * 3.6)])
  );
  const speedingBy = new Map<string, number>();
  for (const r of (speedingRes.data || []) as any[]) {
    speedingBy.set(r.driver_id, (speedingBy.get(r.driver_id) || 0) + 1);
  }
  const behaviorBy = new Map<string, { harshBrakes: number; harshAccels: number; harshOther: number }>();
  for (const r of (behaviorRes.data || []) as any[]) {
    const b = behaviorBy.get(r.driver_id) || { harshBrakes: 0, harshAccels: 0, harshOther: 0 };
    if (r.kind === 'harsh_brake') b.harshBrakes++;
    else if (r.kind === 'harsh_accel') b.harshAccels++;
    else b.harshOther++;
    behaviorBy.set(r.driver_id, b);
  }

  const stats: DriverStats[] = ((driversRes.data || []) as any[]).map((d) => {
    const distanceKm = distanceBy.get(d.id) || 0;
    const b = behaviorBy.get(d.id) || { harshBrakes: 0, harshAccels: 0, harshOther: 0 };
    const counts = {
      speeding: speedingBy.get(d.id) || 0,
      harshBrakes: b.harshBrakes,
      harshAccels: b.harshAccels,
      harshOther: b.harshOther,
    };
    const hasData =
      distanceKm > 0.1 ||
      counts.speeding + counts.harshBrakes + counts.harshAccels + counts.harshOther > 0;
    return {
      driverId: d.id,
      name: d.full_name || 'Unknown driver',
      distanceKm,
      topSpeedKmh: topSpeedBy.get(d.id) ?? null,
      ...counts,
      score: safetyScore(counts, distanceKm),
      hasData,
    };
  });

  // Worst scores first so problems surface; drivers with no data go last.
  const active = stats.filter((s) => s.hasData).sort((a, b) => a.score - b.score);
  const inactive = stats.filter((s) => !s.hasData);

  return (
    <div style={st.wrap}>
      <p style={st.intro}>
        Safety scores for the <strong>last 7 days</strong>, from GPS tracking and the driver
        app&rsquo;s motion sensor. Events are weighted and normalised per 100 km, so busy drivers
        aren&rsquo;t penalised for driving more. 100 = clean record.
      </p>

      {active.length === 0 && (
        <div style={st.empty}>
          <FleetIcon name="live" size={30} stroke={1.4} />
          <div style={{ marginTop: 10, fontWeight: 500, color: 'var(--text-2)' }}>No driving data this week</div>
          <div style={{ marginTop: 4, fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
            Scores appear once drivers share their location from the driver app. Harsh braking and
            acceleration need the mobile app (its motion sensor does the detection).
          </div>
        </div>
      )}

      {active.map((s) => (
        <div key={s.driverId} style={st.card}>
          <div style={{ ...st.scoreBadge, borderColor: scoreColor(s.score) }}>
            <span style={{ fontSize: 19, fontWeight: 700, color: scoreColor(s.score) }}>{s.score}</span>
            <span style={{ fontSize: 9.5, color: 'var(--text-4)', letterSpacing: '0.04em' }}>SCORE</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={st.name}>
              {s.name}
              <span style={{ ...st.tag, color: scoreColor(s.score) }}>{scoreLabel(s.score)}</span>
            </div>
            <div style={st.metaRow}>
              <span style={st.meta}>{s.distanceKm >= 1 ? `${s.distanceKm.toFixed(0)} km driven` : 'under 1 km driven'}</span>
              {s.topSpeedKmh != null && <span style={st.meta}>top {s.topSpeedKmh} km/h</span>}
              <span style={{ ...st.meta, ...(s.speeding > 0 ? st.metaBad : {}) }}>{s.speeding} speeding</span>
              <span style={{ ...st.meta, ...(s.harshBrakes > 0 ? st.metaBad : {}) }}>{s.harshBrakes} sharp braking</span>
              <span style={{ ...st.meta, ...(s.harshAccels > 0 ? st.metaBad : {}) }}>{s.harshAccels} rapid acceleration</span>
              {s.harshOther > 0 && <span style={{ ...st.meta, ...st.metaBad }}>{s.harshOther} other harsh events</span>}
            </div>
          </div>
        </div>
      ))}

      {inactive.length > 0 && active.length > 0 && (
        <div style={st.note}>
          No driving data this week for: {inactive.map((s) => s.name).join(', ')}.
        </div>
      )}

      <div style={st.note}>
        Scores are indicative — detection thresholds are still being tuned. Admins get a summary of
        this page every Monday morning in their notifications.
      </div>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 860 },
  intro: { fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, margin: 0 },
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    background: 'var(--bg-1)',
    border: '1px solid var(--line-1)',
    borderRadius: 'var(--radius-lg, 14px)',
    padding: '14px 16px',
  },
  scoreBadge: {
    width: 58,
    height: 58,
    borderRadius: '50%',
    border: '2.5px solid',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    lineHeight: 1.15,
  },
  name: { fontSize: 14, fontWeight: 600, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  tag: { fontSize: 11, fontWeight: 600 },
  metaRow: { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7 },
  meta: {
    fontSize: 11.5,
    color: 'var(--text-3)',
    background: 'var(--bg-2)',
    border: '1px solid var(--line-1)',
    borderRadius: 999,
    padding: '3px 10px',
  },
  metaBad: { color: 'var(--warn, #f5b54a)', fontWeight: 600 },
  empty: {
    padding: '48px 18px',
    textAlign: 'center',
    color: 'var(--text-3)',
    background: 'var(--bg-1)',
    border: '1px solid var(--line-1)',
    borderRadius: 'var(--radius-lg, 14px)',
  },
  note: { fontSize: 11.5, color: 'var(--text-4)', lineHeight: 1.5 },
};
