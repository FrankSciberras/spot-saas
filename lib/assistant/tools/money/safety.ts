// safety_summary — per-driver safety scores, speeding and harsh-driving counts.
//
// Mirrors app/fleet/safety/page.tsx: speeding_events + driver_behavior_events
// counted per driver, distance from the driver_distances() RPC, top speed from
// driver_max_speeds(), score from safetyScore() / countBehaviorKinds() in
// lib/tracking/safety.ts, lowest scores first, "has data" = > 0.1 km driven or
// any event. The default window is the page's: the last 7 × 24 h up to now.
//
// The tracking RPCs take only a start time (no end, no fleet): they return
// every fleet the user can see, so results are filtered to this fleet's driver
// ids, and for a period that ended in the past the distance is
// distance(since start) − distance(since end). Top speed can't be bounded that
// way, so it is only given for windows that run up to now.
// Raw GPS points are deleted after 90 days (app/api/cron/trips), so a window
// is clamped to the last 90 days.

import type { AssistantTool, Source } from '../../types';
import { argId, argInt, capList, dedupeSources } from '../args';
import { PERIOD_SCHEMA, localDay, periodBoundsUtc, resolvePeriod } from '../../period';
import { countBehaviorKinds, safetyScore } from '@/lib/tracking/safety';
import { readAllPages } from './finance';

/**
 * Score bands — the fleet's own Settings → Live Map values (safety.good_score /
 * safety.fair_score, default 90 / 70), the same ones the Safety page colours by.
 */
const bandOf = (score: number, bands: { good: number; fair: number }) =>
  score >= bands.good ? 'Good' : score >= bands.fair ? 'Fair' : 'Needs attention';

const DAY_MS = 86_400_000;
const RAW_GPS_RETENTION_DAYS = 90;
const MAX_EVENTS = 20_000;

interface DistanceRow {
  driver_id: string;
  distance_m: number | string;
}

interface SpeedRow {
  driver_id: string;
  max_speed: number | string;
}

export const safetySummaryTool: AssistantTool = {
  name: 'safety_summary',
  status: 'Checking driver safety…',
  description:
    'Driver safety from GPS tracking and the driver app motion sensor: per-driver safety score (0–100, 100 = clean), band (Good / Fair / Needs attention), km driven, speeding events, sharp braking, rapid acceleration, sharp cornering, and top speed. ' +
    'Lowest scores first. Default window is the last 7 days, the same as the Safety page. ' +
    'Use for "who is the most dangerous driver", "any speeding this week", "safety scores last month", "how is Ahmed driving".',
  parameters: {
    type: 'object',
    properties: {
      period: PERIOD_SCHEMA,
      driver_id: { type: 'string', description: 'Only this driver (id from find / the page).' },
      limit: { type: 'integer', description: 'How many drivers to list (default 20, max 40).' },
    },
  },
  roles: ['admin', 'staff'],
  module: 'tracking',
  async run(ctx, args) {
    const bands = { good: ctx.settings.safetyGood, fair: ctx.settings.safetyFair };
    const driverId = argId(args, 'driver_id');
    const limit = argInt(args, 'limit', 20, 1, 40);
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const notes: string[] = [];

    // ---- window ---------------------------------------------------------------
    const preset = args.period && typeof args.period === 'object' ? (args.period as { preset?: unknown }).preset : undefined;
    let label: string;
    let sinceIso: string;
    let untilIso: string | null; // null = up to now
    if (preset === undefined || preset === 'last_7_days') {
      // Exactly the Safety page's window: a rolling 7 × 24 h.
      sinceIso = new Date(nowMs - 7 * DAY_MS).toISOString();
      untilIso = null;
      label = 'the last 7 days (same window as the Safety page)';
    } else {
      const period = resolvePeriod(ctx, args.period, 'last_7_days');
      const b = periodBoundsUtc(period, ctx.timeZone);
      sinceIso = b.startIso;
      untilIso = b.endIso > nowIso ? null : b.endIso;
      label = period.label;
    }
    const oldest = new Date(nowMs - RAW_GPS_RETENTION_DAYS * DAY_MS).toISOString();
    if (untilIso && untilIso <= oldest) {
      return {
        data: {
          period: label,
          note: `GPS tracking points are kept for ${RAW_GPS_RETENTION_DAYS} days, so safety scores can't be worked out for this period.`,
        },
        sources: [{ label: 'Driver safety', href: '/fleet/safety' }],
      };
    }
    if (sinceIso < oldest) {
      sinceIso = oldest;
      notes.push(`GPS points are kept for ${RAW_GPS_RETENTION_DAYS} days, so the window starts on ${localDay(oldest, ctx.timeZone)}.`);
    }

    // ---- reads ------------------------------------------------------------------
    const [driversRes, distSince, distUntil, maxSpeeds, speeding, behaviour] = await Promise.all([
      (() => {
        let q = ctx.db.from('drivers').select('id, full_name').eq('organization_id', ctx.orgId);
        if (driverId) q = q.eq('id', driverId);
        return q.order('full_name').range(0, 4999);
      })(),
      ctx.db.rpc('driver_distances', { p_since: sinceIso }),
      untilIso ? ctx.db.rpc('driver_distances', { p_since: untilIso }) : Promise.resolve(null),
      untilIso ? Promise.resolve(null) : ctx.db.rpc('driver_max_speeds', { p_since: sinceIso }),
      readAllPages<{ driver_id: string }>(
        'speeding_events',
        (from, to, withCount) => {
          let q = ctx.db
            .from('speeding_events')
            .select('driver_id', withCount ? { count: 'exact' } : undefined)
            .eq('organization_id', ctx.orgId)
            .gte('occurred_at', sinceIso);
          if (untilIso) q = q.lt('occurred_at', untilIso);
          if (driverId) q = q.eq('driver_id', driverId);
          return q.order('occurred_at', { ascending: true }).order('id', { ascending: true }).range(from, to);
        },
        MAX_EVENTS,
      ),
      readAllPages<{ driver_id: string; kind: string }>(
        'driver_behavior_events',
        (from, to, withCount) => {
          let q = ctx.db
            .from('driver_behavior_events')
            .select('driver_id, kind', withCount ? { count: 'exact' } : undefined)
            .eq('organization_id', ctx.orgId)
            .gte('occurred_at', sinceIso);
          if (untilIso) q = q.lt('occurred_at', untilIso);
          if (driverId) q = q.eq('driver_id', driverId);
          return q.order('occurred_at', { ascending: true }).order('id', { ascending: true }).range(from, to);
        },
        MAX_EVENTS,
      ),
    ]);
    if (driversRes.error) throw new Error(`drivers: ${driversRes.error.message}`);
    if (distSince.error) throw new Error(`driver_distances: ${distSince.error.message}`);
    if (distUntil?.error) throw new Error(`driver_distances: ${distUntil.error.message}`);
    if (maxSpeeds?.error) throw new Error(`driver_max_speeds: ${maxSpeeds.error.message}`);

    const drivers = (driversRes.data ?? []) as { id: string; full_name: string | null }[];
    // The RPCs see every fleet this user belongs to: keep this fleet's drivers only.
    const ours = new Set(drivers.map((d) => d.id));

    const distanceBy = new Map<string, number>();
    for (const r of (distSince.data ?? []) as DistanceRow[]) {
      if (ours.has(r.driver_id)) distanceBy.set(r.driver_id, Number(r.distance_m) / 1000);
    }
    for (const r of (distUntil?.data ?? []) as DistanceRow[]) {
      if (!distanceBy.has(r.driver_id)) continue;
      distanceBy.set(r.driver_id, Math.max(0, (distanceBy.get(r.driver_id) ?? 0) - Number(r.distance_m) / 1000));
    }
    const topSpeedBy = new Map<string, number>();
    for (const r of (maxSpeeds?.data ?? []) as SpeedRow[]) {
      if (ours.has(r.driver_id)) topSpeedBy.set(r.driver_id, Math.round(Number(r.max_speed) * 3.6));
    }
    const speedingBy = new Map<string, number>();
    for (const r of speeding.rows) speedingBy.set(r.driver_id, (speedingBy.get(r.driver_id) ?? 0) + 1);
    const kindsBy = new Map<string, string[]>();
    for (const r of behaviour.rows) {
      const list = kindsBy.get(r.driver_id) ?? [];
      list.push(r.kind);
      kindsBy.set(r.driver_id, list);
    }

    // ---- score, exactly as the Safety page ------------------------------------
    const stats = drivers.map((d) => {
      const distanceKm = distanceBy.get(d.id) ?? 0;
      const counts = { speeding: speedingBy.get(d.id) ?? 0, ...countBehaviorKinds(kindsBy.get(d.id) ?? []) };
      const events = counts.speeding + counts.harshBrakes + counts.harshAccels + counts.harshTurns + counts.harshOther;
      return {
        id: d.id,
        name: d.full_name || 'Unknown driver',
        distanceKm,
        topSpeed: topSpeedBy.get(d.id) ?? null,
        counts,
        events,
        score: safetyScore(counts, distanceKm),
        hasData: distanceKm > 0.1 || events > 0,
      };
    });
    const active = stats.filter((s) => s.hasData).sort((a, b) => a.score - b.score);
    const inactive = stats.filter((s) => !s.hasData).map((s) => s.name);
    const list = capList(active, limit);

    const fleet = active.reduce(
      (acc, s) => {
        acc.km += s.distanceKm;
        acc.speeding += s.counts.speeding;
        acc.harsh += s.events - s.counts.speeding;
        return acc;
      },
      { km: 0, speeding: 0, harsh: 0 },
    );
    if (untilIso) notes.push('Top speed is only available for windows that run up to now.');
    if (speeding.truncated || behaviour.truncated) notes.push(`Only the first ${MAX_EVENTS} events of a kind were read; counts are incomplete.`);
    if (driverId && drivers.length === 0) notes.push('That driver is not in this fleet.');

    const sources: Source[] = [{ label: 'Driver safety', href: '/fleet/safety' }];
    for (const s of list.items.slice(0, 3)) sources.push({ label: `${s.name} — safety`, href: `/fleet/safety/${s.id}` });

    return {
      data: {
        period: label,
        from: localDay(sinceIso, ctx.timeZone),
        to: untilIso ? localDay(new Date(Date.parse(untilIso) - 1).toISOString(), ctx.timeZone) : ctx.today,
        score_bands: {
          good: `${bands.good} and above`,
          fair: `${bands.fair} to ${bands.good - 1}`,
          needs_attention: `below ${bands.fair}`,
        },
        scoring:
          'Weighted events per 100 km driven (speeding weighs most, then sharp braking, acceleration, cornering); 100 = clean record. Scores are indicative: detection thresholds are still being tuned.',
        fleet: {
          drivers_with_data: active.length,
          average_score: active.length ? Math.round(active.reduce((s, x) => s + x.score, 0) / active.length) : null,
          km_driven: Math.round(fleet.km),
          speeding_events: fleet.speeding,
          harsh_events: fleet.harsh,
        },
        drivers: list.items.map((s) => ({
          driver: s.name,
          score: s.score,
          band: bandOf(s.score, bands),
          km_driven: Math.round(s.distanceKm * 10) / 10,
          ...(s.topSpeed != null ? { top_speed_kmh: s.topSpeed } : {}),
          speeding: s.counts.speeding,
          sharp_braking: s.counts.harshBrakes,
          rapid_acceleration: s.counts.harshAccels,
          sharp_cornering: s.counts.harshTurns,
          unclear_harsh: s.counts.harshOther,
        })),
        drivers_truncated: list.truncated,
        ...(inactive.length ? { no_driving_data: capList(inactive, 20).items, no_driving_data_count: inactive.length } : {}),
        ...(notes.length ? { notes } : {}),
      },
      sources: dedupeSources(sources).slice(0, 6),
    };
  },
};
