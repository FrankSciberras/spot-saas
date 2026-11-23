// =============================================================================
// WEBSITE POP-UPS — server-side reads (service role)
// =============================================================================
// The public website asks /api/site-popups for the pop-ups that are live right
// now; this module answers it. "Live" = switched on and inside its dates
// (whole days, Malta time — the same calendar as trial campaigns).
//
// Every public page load asks once, so the answer is kept in memory for a few
// seconds. The app runs as one long-lived Node process, so that cache is
// shared by every visitor; an admin's change shows within LIVE_CACHE_MS.
// =============================================================================

import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import { todayForOffers } from '@/lib/billing/trial-offer';
import { popupFromRow, popupInDates, toPublicPopup, type PopupStats, type PublicPopup, type SitePopup } from './types';

export const LIVE_CACHE_MS = 20_000;

let liveCache: { at: number; popups: PublicPopup[] } | null = null;
let missingTableLogged = false;

/** Pop-ups the website should consider showing right now, best first. */
export async function getLivePopups(): Promise<PublicPopup[]> {
  const now = Date.now();
  if (liveCache && now - liveCache.at < LIVE_CACHE_MS) return liveCache.popups;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('site_popups')
    .select('*')
    .eq('enabled', true)
    .order('priority', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(50);

  if (error) {
    // Before the migration is applied every page would log this — say it once.
    if (!missingTableLogged) {
      missingTableLogged = true;
      console.error('site popups: could not load (run supabase/migrations/20261123_site_popups.sql?):', error.message);
    }
    liveCache = { at: now, popups: [] };
    return [];
  }

  const today = todayForOffers();
  const popups = (data ?? []).map(popupFromRow).filter((p) => popupInDates(p, today)).map(toPublicPopup);
  liveCache = { at: now, popups };
  return popups;
}

/** Forget the cached list (called after an admin saves, in the same process). */
export function invalidateLivePopups() {
  liveCache = null;
}

/** One pop-up, whatever its state — for the admin preview. */
export async function getPopupById(id: string): Promise<SitePopup | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from('site_popups').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return popupFromRow(data);
}

/** Every pop-up with its all-time and last-30-day numbers, for the admin page. */
export async function listPopupsWithStats(): Promise<{
  popups: (SitePopup & { stats: PopupStats; recent: PopupStats })[];
  error?: string;
}> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('site_popups')
    .select('*')
    .order('enabled', { ascending: false })
    .order('priority', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) {
    const missing = /relation .*site_popups.* does not exist|Could not find the table/i.test(error.message);
    return {
      popups: [],
      error: missing
        ? 'The pop-ups table isn’t set up yet. Run supabase/migrations/20261123_site_popups.sql in the Supabase SQL editor.'
        : 'Couldn’t load pop-ups.',
    };
  }

  const popups = (data ?? []).map(popupFromRow);
  const ids = popups.map((p) => p.id);
  const totals = new Map<string, PopupStats>();
  const recent = new Map<string, PopupStats>();
  if (ids.length) {
    const { data: stats } = await admin.from('site_popup_stats').select('popup_id, day, views, clicks, closes').in('popup_id', ids);
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    for (const s of stats ?? []) {
      const add = (m: Map<string, PopupStats>) => {
        const cur = m.get(s.popup_id) ?? { views: 0, clicks: 0, closes: 0 };
        cur.views += s.views ?? 0;
        cur.clicks += s.clicks ?? 0;
        cur.closes += s.closes ?? 0;
        m.set(s.popup_id, cur);
      };
      add(totals);
      if (String(s.day) >= since) add(recent);
    }
  }
  const zero = { views: 0, clicks: 0, closes: 0 };
  return {
    popups: popups.map((p) => ({ ...p, stats: totals.get(p.id) ?? zero, recent: recent.get(p.id) ?? zero })),
  };
}
