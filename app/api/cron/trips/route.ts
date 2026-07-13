import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isPlatformAdmin } from '@/lib/auth/platform';

/**
 * GET /api/cron/trips
 * Turns the raw GPS trail (driver_locations) into trips and stops
 * (driver_trip_segments), then enforces data retention.
 *
 * Runs hourly. Instead of tracking incremental state, it rebuilds a rolling
 * 48-hour window every time: delete every segment that ends inside the window,
 * re-segment the window's points, insert. Idempotent — late points, re-runs
 * and edits all self-correct on the next run. Segments older than the window
 * are never touched, so they are the permanent record. (A stop longer than the
 * window gets its start clamped to the window edge — acceptable for a car
 * parked for days.)
 *
 * Retention: raw GPS points older than 90 days and tracking event logs older
 * than 180 days are deleted. Trip segments are kept forever — they're tiny.
 *
 * Authorization: Bearer CRON_SECRET, or a signed-in platform admin.
 */

const WINDOW_HOURS = 48;
const GAP_MS = 15 * 60_000;        // data gap that closes any segment
const STOP_RADIUS_M = 150;         // staying within this radius = stationary
const STOP_MIN_MS = 8 * 60_000;    // minimum dwell to count as a stop
const MIN_TRIP_M = 300;            // trips shorter than this are GPS drift
const JUMP_M = 2000;               // skip implausible jumps in distance sums
const RAW_RETENTION_DAYS = 90;
const EVENT_RETENTION_DAYS = 180;

interface Pt {
  lat: number;
  lng: number;
  speed: number | null; // m/s
  t: number;            // epoch ms
  shiftId: string | null;
}

interface SegmentRow {
  organization_id: string;
  driver_id: string;
  shift_id: string | null;
  kind: 'trip' | 'stop';
  started_at: string;
  ended_at: string;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  distance_m: number;
  max_speed_kmh: number | null;
  point_count: number;
  is_open: boolean;
  place_hint: string | null;
}

interface Zone {
  organization_id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_m: number;
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function tripDistanceM(pts: Pt[], a: number, b: number): number {
  let sum = 0;
  for (let i = a + 1; i <= b; i++) {
    const d = haversineM(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng);
    if (d <= JUMP_M) sum += d;
  }
  return sum;
}

/** Dwell-cluster segmentation of one gap-free run of points. */
function segmentSession(pts: Pt[]): { kind: 'trip' | 'stop'; a: number; b: number }[] {
  const raw: { kind: 'trip' | 'stop'; a: number; b: number }[] = [];
  let tripStart = 0;
  let i = 0;
  while (i < pts.length) {
    // Grow a stationary cluster anchored at point i.
    let j = i + 1;
    while (j < pts.length && haversineM(pts[i].lat, pts[i].lng, pts[j].lat, pts[j].lng) <= STOP_RADIUS_M) j++;
    if (pts[j - 1].t - pts[i].t >= STOP_MIN_MS) {
      if (i > tripStart) raw.push({ kind: 'trip', a: tripStart, b: i });
      raw.push({ kind: 'stop', a: i, b: j - 1 });
      // The next trip departs from the stop's last point, so segments abut.
      tripStart = j - 1;
      i = j - 1 > i ? j - 1 : j; // always advance
    } else {
      i++;
    }
  }
  if (tripStart < pts.length - 1) raw.push({ kind: 'trip', a: tripStart, b: pts.length - 1 });

  // Merge stop → tiny-wiggle-trip → stop chains into one stop, and drop
  // drift-only "trips" at the session edges.
  const merged: { kind: 'trip' | 'stop'; a: number; b: number }[] = [];
  for (const s of raw) {
    const prev = merged[merged.length - 1];
    if (prev && prev.kind === 'stop' && s.kind === 'stop') {
      prev.b = s.b;
      continue;
    }
    if (prev && prev.kind === 'stop' && s.kind === 'trip' && tripDistanceM(pts, s.a, s.b) < MIN_TRIP_M) {
      prev.b = s.b;
      continue;
    }
    merged.push({ ...s });
  }
  // Second pass: absorbing a wiggle-trip can leave stop-stop neighbours.
  const out: { kind: 'trip' | 'stop'; a: number; b: number }[] = [];
  for (const s of merged) {
    const prev = out[out.length - 1];
    if (prev && prev.kind === 'stop' && s.kind === 'stop') prev.b = s.b;
    else out.push(s);
  }
  return out;
}

function buildDriverSegments(
  orgId: string,
  driverId: string,
  pts: Pt[],
  zones: Zone[],
  nowMs: number
): SegmentRow[] {
  // Split the trail into sessions wherever the data gaps.
  const sessions: Pt[][] = [];
  let cur: Pt[] = [];
  for (const p of pts) {
    if (cur.length > 0 && p.t - cur[cur.length - 1].t > GAP_MS) {
      sessions.push(cur);
      cur = [];
    }
    cur.push(p);
  }
  if (cur.length > 0) sessions.push(cur);

  const rows: SegmentRow[] = [];
  for (let s = 0; s < sessions.length; s++) {
    const sess = sessions[s];
    if (sess.length < 2) continue;
    const segs = segmentSession(sess);
    const lastSession = s === sessions.length - 1;
    for (let k = 0; k < segs.length; k++) {
      const seg = segs[k];
      const a = sess[seg.a];
      const b = sess[seg.b];
      const isOpen = lastSession && k === segs.length - 1 && nowMs - b.t <= GAP_MS;
      const distance = seg.kind === 'trip' ? tripDistanceM(sess, seg.a, seg.b) : 0;

      // Unfinished trips may legitimately still be short — keep those.
      if (seg.kind === 'trip' && distance < MIN_TRIP_M && !isOpen) continue;
      if (b.t <= a.t) continue;

      let maxSpeed: number | null = null;
      if (seg.kind === 'trip') {
        for (let i = seg.a; i <= seg.b; i++) {
          const sp = sess[i].speed;
          if (sp != null && (maxSpeed == null || sp > maxSpeed)) maxSpeed = sp;
        }
      }

      let placeHint: string | null = null;
      if (seg.kind === 'stop') {
        const zone = zones.find(
          (z) =>
            z.organization_id === orgId &&
            haversineM(a.lat, a.lng, z.latitude, z.longitude) <= z.radius_m
        );
        placeHint = zone?.name ?? null;
      }

      rows.push({
        organization_id: orgId,
        driver_id: driverId,
        shift_id: a.shiftId,
        kind: seg.kind,
        started_at: new Date(a.t).toISOString(),
        ended_at: new Date(b.t).toISOString(),
        start_lat: a.lat,
        start_lng: a.lng,
        end_lat: b.lat,
        end_lng: b.lng,
        distance_m: Math.round(distance),
        max_speed_kmh: maxSpeed != null ? Math.round(maxSpeed * 3.6) : null,
        point_count: seg.b - seg.a + 1,
        is_open: isOpen,
        place_hint: placeHint,
      });
    }
  }
  return rows;
}

async function authorize(request: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get('authorization');
    const url = new URL(request.url);
    if (header === `Bearer ${secret}` || url.searchParams.get('secret') === secret) return true;
  }
  return isPlatformAdmin();
}

export async function GET(request: Request) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const supabase = createAdminClient();
    const nowMs = Date.now();
    const windowStart = new Date(nowMs - WINDOW_HOURS * 3600_000).toISOString();

    // 1. Pull the window's GPS points (paged — PostgREST caps at 1000 rows).
    type Row = {
      driver_id: string;
      organization_id: string;
      shift_id: string | null;
      latitude: number;
      longitude: number;
      speed: number | null;
      recorded_at: string;
    };
    const points: Row[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('driver_locations')
        .select('driver_id, organization_id, shift_id, latitude, longitude, speed, recorded_at')
        .gte('recorded_at', windowStart)
        .order('driver_id', { ascending: true })
        .order('recorded_at', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      points.push(...((data || []) as Row[]));
      if (!data || data.length < PAGE) break;
    }

    // 2. Active zones (for naming stops).
    const { data: zonesData } = await supabase
      .from('geofences')
      .select('organization_id, name, latitude, longitude, radius_m')
      .eq('active', true);
    const zones = (zonesData || []) as Zone[];

    // 3. Segment per driver.
    const byDriver = new Map<string, { orgId: string; pts: Pt[] }>();
    for (const r of points) {
      let entry = byDriver.get(r.driver_id);
      if (!entry) {
        entry = { orgId: r.organization_id, pts: [] };
        byDriver.set(r.driver_id, entry);
      }
      entry.pts.push({
        lat: r.latitude,
        lng: r.longitude,
        speed: r.speed != null ? Number(r.speed) : null,
        t: new Date(r.recorded_at).getTime(),
        shiftId: r.shift_id,
      });
    }
    const rows: SegmentRow[] = [];
    for (const [driverId, { orgId, pts }] of byDriver) {
      rows.push(...buildDriverSegments(orgId, driverId, pts, zones, nowMs));
    }

    // 4. Replace the window's segments (anything that ENDS inside the window —
    //    also catches still-open segments that started before it).
    const { error: delError } = await supabase
      .from('driver_trip_segments')
      .delete()
      .gte('ended_at', windowStart);
    if (delError) throw delError;

    for (let i = 0; i < rows.length; i += 500) {
      const { error: insError } = await supabase
        .from('driver_trip_segments')
        .insert(rows.slice(i, i + 500));
      if (insError) throw insError;
    }

    // 5. Retention.
    const rawCutoff = new Date(nowMs - RAW_RETENTION_DAYS * 86400_000).toISOString();
    const eventCutoff = new Date(nowMs - EVENT_RETENTION_DAYS * 86400_000).toISOString();
    await supabase.from('driver_locations').delete().lt('recorded_at', rawCutoff);
    await supabase.from('speeding_events').delete().lt('occurred_at', eventCutoff);
    await supabase.from('geofence_events').delete().lt('occurred_at', eventCutoff);
    await supabase.from('driver_tracking_events').delete().lt('occurred_at', eventCutoff);
    await supabase.from('device_health_events').delete().lt('occurred_at', eventCutoff);

    return NextResponse.json({
      pointsRead: points.length,
      drivers: byDriver.size,
      segmentsWritten: rows.length,
    });
  } catch (error) {
    console.error('trips cron failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
