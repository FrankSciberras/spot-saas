// =============================================================================
// Server side of web analytics: who is asking (for the cookieless hash), and
// recording conversions from server actions.
// =============================================================================
// Signups and contact-form leads are recorded HERE, by the actions that create
// them, rather than by the browser — so they count even when an ad blocker
// stops the page beacon, and nobody can fake one from the console. The
// analytics_track() function credits the conversion to the visitor's latest
// visit, which is how "this signup came from Google" is known.
// =============================================================================

import 'server-only';
import { after } from 'next/server';
import { cookies, headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';
import { CONSENT_COOKIE, IGNORE_COOKIE, VISITOR_COOKIE } from './constants';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The parts of a request the cookieless visitor hash is built from. Never stored. */
export interface Requester {
  ip: string;
  ua: string;
  host: string;
  /** Consented visitor id, only when the cookie banner answer is "granted". */
  vid: string | null;
  /** The browser opted out of being counted (admin "exclude my visits"). */
  ignored: boolean;
}

export function clientIp(h: Headers): string {
  return (
    h.get('cf-connecting-ip')?.trim() ||
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip')?.trim() ||
    ''
  );
}

export function siteHost(h: Headers): string {
  return (h.get('x-forwarded-host') || h.get('host') || '').split(',')[0].trim().toLowerCase();
}

/** Visitor id from the consent cookies, if (and only if) the visitor allowed it. */
export function consentedVisitorId(get: (name: string) => string | undefined): string | null {
  if (get(CONSENT_COOKIE) !== 'granted') return null;
  const vid = get(VISITOR_COOKIE)?.toLowerCase();
  return vid && UUID_RE.test(vid) ? vid : null;
}

/** Office / home IPs to leave out of the stats: ANALYTICS_EXCLUDE_IPS=1.2.3.4,5.6.7.8 */
export function isExcludedIp(ip: string): boolean {
  const list = process.env.ANALYTICS_EXCLUDE_IPS;
  if (!list || !ip) return false;
  return list.split(',').map((s) => s.trim()).includes(ip);
}

async function currentRequester(): Promise<Requester | null> {
  try {
    const h = await headers();
    const c = await cookies();
    const get = (n: string) => c.get(n)?.value;
    return {
      ip: clientIp(h),
      ua: h.get('user-agent') ?? '',
      host: siteHost(h),
      vid: consentedVisitorId(get),
      ignored: get(IGNORE_COOKIE) === '1',
    };
  } catch {
    return null; // not inside a request
  }
}

/**
 * Record a conversion against the current visitor's latest visit. Best-effort
 * and deferred until after the response (via `after`), so it can never slow
 * down or break the action that calls it.
 */
export async function recordConversion(
  name: 'Signup' | 'Lead',
  props: Record<string, string | number | boolean | null>,
  path: string,
): Promise<void> {
  if (process.env.ANALYTICS_DISABLED === '1') return;
  const who = await currentRequester();
  if (!who || who.ignored || isExcludedIp(who.ip)) return;

  const run = async () => {
    try {
      const { error } = await createAdminClient().rpc('analytics_track', {
        p: { type: 'conversion', name, path, props, ip: who.ip, ua: who.ua, host: who.host, vid: who.vid },
      });
      if (error) console.error(`analytics: ${name} conversion not recorded:`, error.message);
    } catch (err) {
      console.error(`analytics: ${name} conversion failed:`, err);
    }
  };

  try {
    after(run);
  } catch {
    await run(); // outside a request scope `after` throws — just run it
  }
}
