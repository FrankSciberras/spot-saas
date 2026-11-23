// =============================================================================
// WEBSITE POP-UPS — shared types and rules (client-safe)
// =============================================================================
// A pop-up is set up in Admin Console → Popups and shown on the public website
// by components/marketing/popups/SitePopups.tsx. This module holds what both
// sides agree on: the shape of a pop-up, how its page patterns match a path,
// and how its fields are cleaned before saving.
//
// Stored in site_popups (supabase/migrations/20261123_site_popups.sql).
// =============================================================================

export type PopupLayout = 'modal' | 'slide';
export type PopupDevices = 'all' | 'desktop' | 'mobile';
export type PopupTrigger = 'delay' | 'scroll' | 'exit';
export type PopupFrequency = 'once' | 'visit' | 'days';

/** What the website needs to show a pop-up — nothing admin-only. */
export interface PublicPopup {
  id: string;
  name: string;
  version: number;
  layout: PopupLayout;
  tag: string | null;
  title: string;
  body: string | null;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  dismissLabel: string | null;
  pages: string[];
  devices: PopupDevices;
  trigger: PopupTrigger;
  triggerValue: number;
  frequency: PopupFrequency;
  frequencyDays: number;
}

/** The full row, as the admin edits it. */
export interface SitePopup extends PublicPopup {
  enabled: boolean;
  startsOn: string | null;
  endsOn: string | null;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface PopupStats {
  views: number;
  clicks: number;
  closes: number;
}

/** What the admin form sends to save. */
export type PopupInput = Omit<SitePopup, 'id' | 'version' | 'createdAt' | 'updatedAt'> & { id?: string };

export const POPUP_LIMITS = {
  name: 80,
  tag: 30,
  title: 90,
  body: 400,
  ctaLabel: 40,
  dismissLabel: 40,
  url: 500,
  pages: 30,
  page: 120,
} as const;

/** Never show a pop-up here — sign-in, auth plumbing, unsubscribe links. */
const NEVER_ON = /^\/(login|auth|offline|unsubscribe)(\/|$)/;

/** Viewport width (px) below which a visitor counts as on a phone. */
export const MOBILE_MAX_WIDTH = 767;

/** URL parameter that forces a pop-up open (admin preview, heatmap viewer). */
export const POPUP_PREVIEW_PARAM = 'rv-popup-preview';

/** Fired on window when a pop-up opens or closes: detail { id, open }. */
export const POPUP_EVENT = 'rovora:popup';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Normalise one page pattern: '/pricing', '/blog/*', '/' — or null if unusable. */
export function cleanPagePattern(raw: string): string | null {
  let p = raw.trim();
  if (!p) return null;
  // Accept a pasted full URL: keep only its path.
  if (/^https?:\/\//i.test(p)) {
    try {
      p = new URL(p).pathname;
    } catch {
      return null;
    }
  }
  p = p.split(/[?#]/)[0];
  if (!p.startsWith('/')) p = `/${p}`;
  const section = p.endsWith('/*');
  p = p.replace(/\/\*$/, '').replace(/\/+$/, '') || '/';
  if (!/^\/[A-Za-z0-9\-._~/]*$/.test(p) || p.includes('//')) return null;
  if (section) return p === '/' ? '/*' : `${p}/*`;
  return p.slice(0, POPUP_LIMITS.page);
}

/**
 * Does a pattern list cover this path? Empty list = every page. '/' is the
 * homepage only; '/blog/*' is the blog index and every post; '/*' is everything.
 */
export function pageMatches(pages: string[], path: string): boolean {
  if (!pages.length) return true;
  const p = path.replace(/\/+$/, '') || '/';
  return pages.some((pattern) => {
    if (pattern === '/*') return true;
    if (pattern.endsWith('/*')) {
      const base = pattern.slice(0, -2);
      return p === base || p.startsWith(`${base}/`);
    }
    return p === pattern;
  });
}

/** Pages a pop-up may appear on at all (public site, not sign-in). */
export function popupAllowedOn(path: string): boolean {
  return !NEVER_ON.test(path);
}

/** Only links a pop-up button may point at: on-site paths or http(s). */
export function cleanPopupUrl(raw: string | null | undefined): string | null {
  const u = (raw ?? '').trim();
  if (!u) return null;
  if (u.startsWith('/') && !u.startsWith('//')) return u.slice(0, POPUP_LIMITS.url);
  if (/^mailto:|^tel:/i.test(u)) return u.slice(0, POPUP_LIMITS.url);
  try {
    const url = new URL(u);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString().slice(0, POPUP_LIMITS.url);
  } catch {
    // fall through
  }
  return null;
}

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\r\n/g, '\n').trim();
  return t ? t.slice(0, max) : null;
};

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

const int = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

/** A database row → the shape the app uses. */
export function popupFromRow(r: Record<string, unknown>): SitePopup {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    version: int(r.version, 1, 1_000_000, 1),
    enabled: r.enabled === true,
    layout: pick(r.layout, ['modal', 'slide'] as const, 'modal'),
    tag: text(r.tag, POPUP_LIMITS.tag),
    title: String(r.title ?? ''),
    body: text(r.body, POPUP_LIMITS.body),
    imageUrl: text(r.image_url, POPUP_LIMITS.url),
    ctaLabel: text(r.cta_label, POPUP_LIMITS.ctaLabel),
    ctaUrl: text(r.cta_url, POPUP_LIMITS.url),
    dismissLabel: text(r.dismiss_label, POPUP_LIMITS.dismissLabel),
    pages: Array.isArray(r.pages) ? (r.pages as unknown[]).filter((p): p is string => typeof p === 'string') : [],
    devices: pick(r.devices, ['all', 'desktop', 'mobile'] as const, 'all'),
    trigger: pick(r.trigger, ['delay', 'scroll', 'exit'] as const, 'delay'),
    triggerValue: int(r.trigger_value, 0, 600, 5),
    frequency: pick(r.frequency, ['once', 'visit', 'days'] as const, 'once'),
    frequencyDays: int(r.frequency_days, 1, 365, 7),
    startsOn: typeof r.starts_on === 'string' ? r.starts_on : null,
    endsOn: typeof r.ends_on === 'string' ? r.ends_on : null,
    priority: int(r.priority, -1000, 1000, 0),
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  };
}

/** Strip a pop-up down to what the public website may see. */
export function toPublicPopup(p: SitePopup): PublicPopup {
  return {
    id: p.id,
    name: p.name,
    version: p.version,
    layout: p.layout,
    tag: p.tag,
    title: p.title,
    body: p.body,
    imageUrl: p.imageUrl,
    ctaLabel: p.ctaLabel,
    ctaUrl: p.ctaUrl,
    dismissLabel: p.dismissLabel,
    pages: p.pages,
    devices: p.devices,
    trigger: p.trigger,
    triggerValue: p.triggerValue,
    frequency: p.frequency,
    frequencyDays: p.frequencyDays,
  };
}

/** Clean what the admin form posted into database columns, or an error. */
export function popupInputToRow(
  input: PopupInput,
  isValidDay: (d: string) => boolean,
): { row: Record<string, unknown> } | { error: string } {
  const name = text(input.name, POPUP_LIMITS.name);
  if (!name) return { error: 'Give the pop-up a name (only you see it).' };
  const title = text(input.title, POPUP_LIMITS.title);
  if (!title) return { error: 'Add a title — it’s the headline visitors see.' };

  const ctaLabel = text(input.ctaLabel, POPUP_LIMITS.ctaLabel);
  const rawUrl = (input.ctaUrl ?? '').trim();
  const ctaUrl = cleanPopupUrl(rawUrl);
  if (rawUrl && !ctaUrl) return { error: 'The button link must start with / (a page on rovora.eu) or https://.' };
  if (ctaLabel && !ctaUrl) return { error: 'Add a link for the button, or clear the button text.' };
  if (ctaUrl && !ctaLabel) return { error: 'Add text for the button, e.g. “Get started free”.' };

  const imageRaw = (input.imageUrl ?? '').trim();
  const imageUrl = imageRaw ? cleanPopupUrl(imageRaw) : null;
  if (imageRaw && (!imageUrl || imageUrl.startsWith('mailto:') || imageUrl.startsWith('tel:'))) {
    return { error: 'The image must be an uploaded image or an https:// link.' };
  }

  const pages: string[] = [];
  for (const raw of (input.pages ?? []).slice(0, POPUP_LIMITS.pages)) {
    const p = cleanPagePattern(raw);
    if (p === null) return { error: `“${raw}” isn’t a page path. Use e.g. /pricing or /blog/*.` };
    if (!pages.includes(p)) pages.push(p);
  }

  const startsOn = input.startsOn ? input.startsOn.trim() : '';
  const endsOn = input.endsOn ? input.endsOn.trim() : '';
  if (startsOn && !isValidDay(startsOn)) return { error: 'Pick a valid start date.' };
  if (endsOn && !isValidDay(endsOn)) return { error: 'Pick a valid end date.' };
  if (startsOn && endsOn && startsOn > endsOn) return { error: 'The end date is before the start date.' };

  const trigger = pick(input.trigger, ['delay', 'scroll', 'exit'] as const, 'delay');
  return {
    row: {
      name,
      enabled: input.enabled === true,
      layout: pick(input.layout, ['modal', 'slide'] as const, 'modal'),
      tag: text(input.tag, POPUP_LIMITS.tag),
      title,
      body: text(input.body, POPUP_LIMITS.body),
      image_url: imageUrl,
      cta_label: ctaLabel,
      cta_url: ctaUrl,
      dismiss_label: text(input.dismissLabel, POPUP_LIMITS.dismissLabel),
      pages,
      devices: pick(input.devices, ['all', 'desktop', 'mobile'] as const, 'all'),
      trigger,
      trigger_value: trigger === 'scroll' ? int(input.triggerValue, 5, 100, 50) : int(input.triggerValue, 0, 600, 5),
      frequency: pick(input.frequency, ['once', 'visit', 'days'] as const, 'once'),
      frequency_days: int(input.frequencyDays, 1, 365, 7),
      starts_on: startsOn || null,
      ends_on: endsOn || null,
      priority: int(input.priority, -1000, 1000, 0),
    },
  };
}

/** A blank pop-up for "New pop-up". */
export const EMPTY_POPUP: PopupInput = {
  name: '',
  enabled: false,
  layout: 'modal',
  tag: null,
  title: '',
  body: null,
  imageUrl: null,
  ctaLabel: 'Get started free',
  ctaUrl: '/login?mode=signup',
  dismissLabel: null,
  pages: [],
  devices: 'all',
  trigger: 'delay',
  triggerValue: 5,
  frequency: 'once',
  frequencyDays: 7,
  startsOn: null,
  endsOn: null,
  priority: 0,
};

/** Is a pop-up inside its dates on `today` ('YYYY-MM-DD', Malta)? */
export function popupInDates(p: { startsOn: string | null; endsOn: string | null }, today: string): boolean {
  return (!p.startsOn || p.startsOn <= today) && (!p.endsOn || today <= p.endsOn);
}
