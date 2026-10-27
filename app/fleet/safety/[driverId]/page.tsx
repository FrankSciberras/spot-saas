import { Suspense, type CSSProperties } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import SafetyEventsWorkspace, { type DetailEvent } from '@/components/fleet/safety/SafetyEventsWorkspace';
import { countBehaviorKinds, safetyScore, scoreColor, scoreLabel, type SafetyEventKind } from '@/lib/tracking/safety';

interface PageProps {
  params: Promise<{ driverId: string }>;
  searchParams: Promise<{ days?: string; event?: string }>;
}

const PERIODS = [
  { days: 7, label: 'Last 7 days' },
  { days: 28, label: 'Last 4 weeks' },
];

export default async function DriverSafetyPage({ params, searchParams }: PageProps) {
  const { driverId } = await params;
  const { days: daysParam, event } = await searchParams;
  const user = await requireRole(['admin', 'staff']);
  await requireModule(user.organization_id, 'tracking');
  const days = PERIODS.some((p) => String(p.days) === daysParam) ? Number(daysParam) : 7;
  return (
    <FleetShell user={user} title="Driver Safety">
      <Suspense fallback={<FleetPageSkeleton variant="board" stats={0} />}>
        <DriverSafetyContent orgId={user.organization_id} driverId={driverId} days={days} initialEventId={event || null} />
      </Suspense>
    </FleetShell>
  );
}

const BEHAVIOR_FULL =
  'id, kind, magnitude, latitude, longitude, occurred_at, shift_id, speed_before_kmh, speed_after_kmh, duration_ms, turn_rate, heading, accuracy_m, classified_by, trail, app_version, place_name';
const BEHAVIOR_BASIC = 'id, kind, magnitude, latitude, longitude, occurred_at, shift_id';

async function DriverSafetyContent({
  orgId,
  driverId,
  days,
  initialEventId,
}: {
  orgId: string;
  driverId: string;
  days: number;
  initialEventId: string | null;
}) {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const { data: driver } = await supabase
    .from('drivers')
    .select('id, full_name')
    .eq('id', driverId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!driver) notFound();

  const behaviorQuery = (cols: string) =>
    supabase
      .from('driver_behavior_events')
      .select(cols)
      .eq('organization_id', orgId)
      .eq('driver_id', driverId)
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false })
      .range(0, 1999);
  const speedingQuery = (cols: string) =>
    supabase
      .from('speeding_events')
      .select(cols)
      .eq('organization_id', orgId)
      .eq('driver_id', driverId)
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false })
      .range(0, 1999);

  const [behaviorFull, speedingFull, distancesRes, maxSpeedsRes, shiftsRes] = await Promise.all([
    behaviorQuery(BEHAVIOR_FULL),
    speedingQuery('id, speed_kmh, limit_kmh, latitude, longitude, occurred_at, place_name'),
    supabase.rpc('driver_distances', { p_since: since }),
    supabase.rpc('driver_max_speeds', { p_since: since }),
    supabase
      .from('driver_shifts')
      .select('id, name, vehicle_id, start_time, end_time')
      .eq('organization_id', orgId)
      .eq('driver_id', driverId)
      .gte('start_time', new Date(Date.now() - (days + 2) * 86400_000).toISOString())
      .order('start_time', { ascending: false }),
  ]);
  // Before migration 20261026 the extra columns don't exist — fall back.
  const behaviorRes = behaviorFull.error ? await behaviorQuery(BEHAVIOR_BASIC) : behaviorFull;
  const speedingRes = speedingFull.error
    ? await speedingQuery('id, speed_kmh, limit_kmh, latitude, longitude, occurred_at')
    : speedingFull;

  const shifts = (shiftsRes.data || []) as { id: string; name: string | null; vehicle_id: string | null; start_time: string; end_time: string | null }[];
  const vehicleIds = [...new Set(shifts.map((s) => s.vehicle_id).filter(Boolean))] as string[];
  const { data: vehicles } = vehicleIds.length
    ? await supabase.from('vehicles').select('id, registration_number, make, model').in('id', vehicleIds)
    : { data: [] };
  const vehicleLabel = new Map<string, string>(
    ((vehicles || []) as any[]).map((v) => [
      v.id,
      [v.registration_number, [v.make, v.model].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
    ])
  );
  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  const shiftAt = (iso: string, shiftId?: string | null) => {
    if (shiftId && shiftById.has(shiftId)) return shiftById.get(shiftId)!;
    const t = new Date(iso).getTime();
    return shifts.find((s) => new Date(s.start_time).getTime() <= t && (!s.end_time || new Date(s.end_time).getTime() >= t)) || null;
  };

  const num = (v: unknown) => (v == null ? null : Number(v));
  const events: DetailEvent[] = [];
  for (const r of (behaviorRes.data || []) as any[]) {
    const shift = shiftAt(r.occurred_at, r.shift_id);
    events.push({
      id: r.id,
      source: 'behavior',
      kind: r.kind as SafetyEventKind,
      at: r.occurred_at,
      lat: r.latitude,
      lng: r.longitude,
      magnitude: num(r.magnitude),
      speedBefore: num(r.speed_before_kmh),
      speedAfter: num(r.speed_after_kmh),
      durationMs: r.duration_ms ?? null,
      turnRate: num(r.turn_rate),
      accuracy: num(r.accuracy_m),
      classifiedBy: r.classified_by ?? null,
      trail: Array.isArray(r.trail) ? r.trail : null,
      appVersion: r.app_version ?? null,
      place: r.place_name ?? null,
      speedKmh: null,
      limitKmh: null,
      vehicle: shift?.vehicle_id ? vehicleLabel.get(shift.vehicle_id) || null : null,
      shiftName: shift?.name || null,
    });
  }
  for (const r of (speedingRes.data || []) as any[]) {
    const shift = shiftAt(r.occurred_at);
    events.push({
      id: r.id,
      source: 'speeding',
      kind: 'speeding',
      at: r.occurred_at,
      lat: r.latitude,
      lng: r.longitude,
      magnitude: null,
      speedBefore: null,
      speedAfter: null,
      durationMs: null,
      turnRate: null,
      accuracy: null,
      classifiedBy: null,
      trail: null,
      appVersion: null,
      place: r.place_name ?? null,
      speedKmh: r.speed_kmh,
      limitKmh: r.limit_kmh,
      vehicle: shift?.vehicle_id ? vehicleLabel.get(shift.vehicle_id) || null : null,
      shiftName: shift?.name || null,
    });
  }
  events.sort((a, b) => (a.at < b.at ? 1 : -1));

  const distanceKm =
    Number(((distancesRes.data || []) as any[]).find((r) => r.driver_id === driverId)?.distance_m || 0) / 1000;
  const maxSpeed = ((maxSpeedsRes.data || []) as any[]).find((r) => r.driver_id === driverId)?.max_speed;
  const topSpeedKmh = maxSpeed != null ? Math.round(Number(maxSpeed) * 3.6) : null;
  const counts = {
    speeding: (speedingRes.data || []).length,
    ...countBehaviorKinds(((behaviorRes.data || []) as any[]).map((r) => r.kind)),
  };
  const score = safetyScore(counts, distanceKm);

  return (
    <div style={st.wrap}>
      <Link href="/fleet/safety" className="fleetHover" style={st.back}>
        ← All drivers
      </Link>

      <div style={st.head}>
        <div style={{ ...st.scoreBadge, borderColor: scoreColor(score) }}>
          <span style={{ fontSize: 19, fontWeight: 700, color: scoreColor(score) }}>{score}</span>
          <span style={{ fontSize: 9.5, color: 'var(--text-4)', letterSpacing: '0.04em' }}>SCORE</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={st.name}>
            {driver.full_name || 'Unknown driver'}
            <span style={{ fontSize: 11, fontWeight: 600, color: scoreColor(score) }}>{scoreLabel(score)}</span>
          </div>
          <div style={st.sub}>
            {distanceKm >= 1 ? `${distanceKm.toFixed(0)} km driven` : 'under 1 km driven'}
            {topSpeedKmh != null && ` · top ${topSpeedKmh} km/h`}
            {` · ${events.length} ${events.length === 1 ? 'event' : 'events'}`}
          </div>
        </div>
        <div style={st.periods}>
          {PERIODS.map((p) => (
            <Link
              key={p.days}
              href={`/fleet/safety/${driverId}?days=${p.days}`}
              className="fleetHover"
              style={{ ...st.period, ...(p.days === days ? st.periodOn : {}) }}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      <SafetyEventsWorkspace driverId={driverId} events={events} initialEventId={initialEventId} />
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 960 },
  back: { fontSize: 12.5, color: 'var(--text-3)', textDecoration: 'none', alignSelf: 'flex-start' },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'wrap',
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
  name: { fontSize: 15, fontWeight: 600, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  sub: { fontSize: 12.5, color: 'var(--text-3)', marginTop: 4 },
  periods: { display: 'flex', gap: 6 },
  period: {
    padding: '6px 11px',
    border: '1px solid var(--line-2)',
    borderRadius: 999,
    fontSize: 12,
    color: 'var(--text-2)',
    textDecoration: 'none',
  },
  periodOn: { background: 'var(--text-1)', color: 'var(--bg-1)', borderColor: 'var(--text-1)', fontWeight: 600 },
};
