import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { isPlatformAdmin } from '@/lib/auth/platform';
import { safetyScore } from '@/lib/tracking/safety';

/**
 * GET /api/cron/safety-report
 * Weekly (Monday morning) driver-safety summary per fleet: average score,
 * lowest-scoring driver and event totals for the last 7 days, delivered as an
 * admin notification linking to /fleet/safety. Fleets with no driving data
 * that week are skipped.
 *
 * Authorization: Bearer CRON_SECRET, or a signed-in platform admin.
 */
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
    const since = new Date(Date.now() - 7 * 86400_000).toISOString();

    const [driversRes, distancesRes, speedingRes, behaviorRes] = await Promise.all([
      supabase.from('drivers').select('id, organization_id, full_name').range(0, 9999),
      supabase.rpc('driver_distances', { p_since: since }),
      supabase.from('speeding_events').select('driver_id').gte('occurred_at', since).range(0, 9999),
      supabase.from('driver_behavior_events').select('driver_id, kind').gte('occurred_at', since).range(0, 9999),
    ]);

    const distanceBy = new Map<string, number>(
      ((distancesRes.data || []) as any[]).map((r) => [r.driver_id, Number(r.distance_m) / 1000])
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

    // Score every driver with data, grouped per fleet.
    interface OrgAgg {
      scores: { name: string; score: number }[];
      harsh: number;
      speeding: number;
    }
    const byOrg = new Map<string, OrgAgg>();
    for (const d of (driversRes.data || []) as any[]) {
      const distanceKm = distanceBy.get(d.id) || 0;
      const b = behaviorBy.get(d.id) || { harshBrakes: 0, harshAccels: 0, harshOther: 0 };
      const speeding = speedingBy.get(d.id) || 0;
      const harsh = b.harshBrakes + b.harshAccels + b.harshOther;
      if (distanceKm <= 0.1 && speeding + harsh === 0) continue;

      const agg = byOrg.get(d.organization_id) || { scores: [], harsh: 0, speeding: 0 };
      agg.scores.push({
        name: d.full_name || 'Unknown driver',
        score: safetyScore({ speeding, harshBrakes: b.harshBrakes, harshAccels: b.harshAccels, harshOther: b.harshOther }, distanceKm),
      });
      agg.harsh += harsh;
      agg.speeding += speeding;
      byOrg.set(d.organization_id, agg);
    }

    let sent = 0;
    for (const [orgId, agg] of byOrg) {
      const avg = Math.round(agg.scores.reduce((s, x) => s + x.score, 0) / agg.scores.length);
      const worst = agg.scores.reduce((min, x) => (x.score < min.score ? x : min), agg.scores[0]);
      const body =
        `Average safety score ${avg}/100 across ${agg.scores.length} active ` +
        `${agg.scores.length === 1 ? 'driver' : 'drivers'} last week. ` +
        (agg.scores.length > 1 ? `Lowest: ${worst.name} (${worst.score}). ` : '') +
        `${agg.harsh} harsh-driving ${agg.harsh === 1 ? 'event' : 'events'}, ` +
        `${agg.speeding} speeding ${agg.speeding === 1 ? 'alert' : 'alerts'}.`;
      await supabase.from('notifications').insert({
        organization_id: orgId,
        driver_id: null,
        title: 'Weekly driver safety report',
        body,
        type: 'info',
        action_url: '/fleet/safety',
        target_role: 'admin',
      });
      sent++;
    }

    return NextResponse.json({ fleetsReported: sent });
  } catch (error) {
    console.error('safety-report failed:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
