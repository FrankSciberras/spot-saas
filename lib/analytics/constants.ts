// Shared by the browser tracker, the collector route and the admin page.
// Nothing secret lives here — it is bundled into the client.

/** Where the browser sends beacons. Deliberately bland so blocklists that
 *  target "/analytics", "/collect" or "/track" leave it alone. */
export const COLLECT_PATH = '/api/rv';

/** The visitor's cookie-banner answer: 'granted' | 'denied'. Readable by JS so
 *  the banner knows whether to show. Kept ~6 months, then we ask again. */
export const CONSENT_COOKIE = 'rv_consent';
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 182;

/** Random visitor id, set (HttpOnly, by the server) only after "Allow". 13
 *  months is the longest audience-measurement cookies should live. */
export const VISITOR_COOKIE = 'rv_vid';
export const VISITOR_MAX_AGE = 60 * 60 * 24 * 395;

/** "Don't count my visits" — set from the admin Analytics page. */
export const IGNORE_COOKIE = 'rv_ignore';
export const IGNORE_MAX_AGE = 60 * 60 * 24 * 400;

/** Window event that re-opens the cookie banner (footer "Cookie settings"). */
export const OPEN_CONSENT_EVENT = 'rovora:cookie-settings';

/** Conversions are recorded server-side by the actions that create them; the
 *  browser may not send these names (or forge a page view by name). */
export const SERVER_ONLY_EVENTS = new Set(['pageview', 'Signup', 'Lead']);

/** Query parameters worth keeping from a landing URL. Everything else in a
 *  query string is dropped before it leaves the browser. */
export const CAMPAIGN_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'source',
  'gclid', 'gbraid', 'wbraid', 'dclid', 'msclkid', 'fbclid', 'ttclid',
  'li_fat_id', 'twclid', 'sccid', 'epik',
] as const;

/** "How did you hear about Rovora?" — asked (optionally) during onboarding. */
export const HEARD_ABOUT_OPTIONS = [
  { id: 'google', label: 'Google or another search engine' },
  { id: 'ai', label: 'ChatGPT or another AI assistant' },
  { id: 'social', label: 'Facebook, Instagram or LinkedIn' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'word_of_mouth', label: 'A friend or another fleet owner' },
  { id: 'platform', label: 'Uber, Bolt or another platform' },
  { id: 'event', label: 'An event or meetup' },
  { id: 'other', label: 'Somewhere else' },
] as const;
