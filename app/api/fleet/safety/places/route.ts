import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/server';

// =============================================================================
// SAFETY EVENT PLACE NAMES
// =============================================================================
// POST { behavior: string[], speeding: string[] } (event ids)
//   -> { places: { [id]: string } }
//
// Turns an event's coordinates into a street-level name ("Triq il-Kbira,
// Birkirkara") via OpenStreetMap's Nominatim, and caches it on the event row
// (place_name) so each event is looked up once, ever. Nominatim's usage policy
// allows at most 1 request/second, so lookups are serialised process-wide and
// each call handles a small batch — the page asks again for the next batch.
// '' is stored when there's no usable address, so it isn't retried.
// =============================================================================

const MAX_LOOKUPS_PER_CALL = 8;
const MIN_GAP_MS = 1100;

const cache = new Map<string, string>(); // rounded "lat,lng" → name
let queue: Promise<void> = Promise.resolve();
let lastCallAt = 0;

/** Run fn after any in-flight lookup, at least MIN_GAP_MS after the last. */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCallAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
    return fn();
  });
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit != null) return hit;
  return throttled(async () => {
    try {
      const url =
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&addressdetails=1` +
        `&lat=${lat}&lon=${lng}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Rovora/1.0 (https://rovora.eu)', 'Accept-Language': 'en' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { address?: Record<string, string>; display_name?: string };
      const a = data.address || {};
      const street = a.road || a.pedestrian || a.residential || a.neighbourhood || null;
      const area = a.suburb || a.village || a.town || a.city || a.municipality || null;
      const name = [street, area].filter(Boolean).join(', ') || (data.display_name || '').split(',').slice(0, 2).join(',').trim();
      cache.set(key, name);
      return name;
    } catch {
      return null; // network/timeout — leave unstored so it's retried later
    }
  });
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin' && user.role !== 'staff') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const ids = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 50) : [];
  const behaviorIds = ids(body.behavior);
  const speedingIds = ids(body.speeding);

  const admin = createAdminClient();
  const places: Record<string, string> = {};
  let budget = MAX_LOOKUPS_PER_CALL;

  for (const [table, list] of [
    ['driver_behavior_events', behaviorIds],
    ['speeding_events', speedingIds],
  ] as const) {
    if (list.length === 0 || budget <= 0) continue;
    // Scoped to the caller's fleet: ids from another fleet simply don't match.
    const { data, error } = await admin
      .from(table)
      .select('id, latitude, longitude, place_name')
      .eq('organization_id', user.organization_id)
      .in('id', list);
    if (error) continue; // e.g. migration 20261026 not applied yet — fail soft
    for (const row of (data || []) as { id: string; latitude: number | null; longitude: number | null; place_name: string | null }[]) {
      if (row.place_name != null) {
        places[row.id] = row.place_name;
        continue;
      }
      if (row.latitude == null || row.longitude == null || budget <= 0) continue;
      budget--;
      const name = await reverseGeocode(row.latitude, row.longitude);
      if (name == null) continue;
      places[row.id] = name;
      await admin.from(table).update({ place_name: name }).eq('id', row.id).eq('organization_id', user.organization_id);
    }
  }

  return NextResponse.json({ places }, { headers: { 'Cache-Control': 'private, no-store' } });
}
