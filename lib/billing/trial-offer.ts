// =============================================================================
// BILLING — FREE-TRIAL OFFER (client-safe)
// =============================================================================
// How long a NEW sign-up's free trial lasts is no longer hardcoded: the platform
// admin sets it in /admin → Trials. The offer has two parts:
//
//   standardDays  the everyday trial length (30 unless changed)
//   promo         an optional campaign, e.g. "3 months free if you sign up by
//                 31 Oct" — while it runs, new sign-ups get its length instead,
//                 and when its last day passes the site drops back to the
//                 standard trial on its own
//
// Stored as one JSON row in app_settings (key 'trial_offer', platform org) and
// loaded by ./trial-offer-data. This module holds only the types and the pure
// helpers that turn an offer into what to grant and what to say, so it can be
// imported from client components too.
//
// Existing fleets keep the trial they signed up with — changing the offer only
// affects fleets created from then on.
// =============================================================================

import { TRIAL_DAYS } from './plans';

export const MIN_TRIAL_DAYS = 1;
export const MAX_TRIAL_DAYS = 365;
const PROMO_LABEL_MAX = 40;

/** Campaign dates are whole days in the business's own time zone. */
const OFFER_TIME_ZONE = 'Europe/Malta';

export interface TrialPromo {
  /** Trial length (days) for anyone who signs up while the campaign runs. */
  days: number;
  /** Last day of the campaign, 'YYYY-MM-DD' (Malta time), inclusive. null = runs until switched off. */
  endsOn: string | null;
  /** Optional short name shown on the website, e.g. 'Autumn offer'. */
  label: string | null;
}

export interface TrialOffer {
  standardDays: number;
  promo: TrialPromo | null;
}

export const DEFAULT_TRIAL_OFFER: TrialOffer = { standardDays: TRIAL_DAYS, promo: null };

/**
 * What a new sign-up gets right now, plus ready-made copy for it. Customer-
 * facing copy never says "trial" — it leads with "free" ("First 30 days free",
 * "Get started free"). "Trial" stays the internal/admin and code term.
 */
export interface TrialCopy {
  /** Trial length granted to a fleet created right now. */
  days: number;
  /** '30 days', '3 months' — reads as "free for 3 months". */
  span: string;
  /** 'first 30 days', 'first 3 months', 'first year' — reads as "get your first 3 months free". */
  first: string;
  /** 'First 30 days free' — a ready-made checkmark line. */
  freeLabel: string;
  /** The campaign that's running, or null when it's the standard trial. */
  promo: null | {
    label: string | null;
    /** e.g. '31 October', or null when it has no end date. */
    endsLabel: string | null;
    /** Today is its last day. */
    endsToday: boolean;
    /** The everyday trial it temporarily replaces, e.g. '30 days'. */
    usualSpan: string;
  };
}

function clampDays(value: unknown, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < MIN_TRIAL_DAYS) return fallback;
  return Math.min(n, MAX_TRIAL_DAYS);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDay(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Coerce whatever is stored (or posted) into a well-formed offer. */
export function normalizeTrialOffer(raw: unknown): TrialOffer {
  if (!raw || typeof raw !== 'object') return DEFAULT_TRIAL_OFFER;
  const r = raw as Record<string, unknown>;
  const standardDays = clampDays(r.standardDays, TRIAL_DAYS);

  let promo: TrialPromo | null = null;
  if (r.promo && typeof r.promo === 'object') {
    const p = r.promo as Record<string, unknown>;
    const endsOn = typeof p.endsOn === 'string' && isValidDay(p.endsOn) ? p.endsOn : null;
    const label = typeof p.label === 'string' ? p.label.trim().slice(0, PROMO_LABEL_MAX) : '';
    promo = { days: clampDays(p.days, standardDays), endsOn, label: label || null };
  }
  return { standardDays, promo };
}

/** Today's date in Malta as 'YYYY-MM-DD'. */
export function todayForOffers(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: OFFER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Is the campaign running on `now`? (Its end day counts as running.) */
export function isPromoLive(promo: TrialPromo | null, now: Date = new Date()): promo is TrialPromo {
  return !!promo && (promo.endsOn === null || todayForOffers(now) <= promo.endsOn);
}

/** Trial length a fleet created at `now` should get. */
export function currentTrialDays(offer: TrialOffer, now: Date = new Date()): number {
  return isPromoLive(offer.promo, now) ? offer.promo.days : offer.standardDays;
}

function lengthParts(days: number): { n: number; unit: 'day' | 'month' | 'year' } {
  if (days % 365 === 0) return { n: days / 365, unit: 'year' };
  // 30 stays "30 days" (the long-standing wording); 60, 90, 180 read as months.
  if (days >= 60 && days % 30 === 0) return { n: days / 30, unit: 'month' };
  return { n: days, unit: 'day' };
}

/** 'first 30 days', 'first 3 months', 'first year'. */
export function trialFirstPhrase(days: number): string {
  const { n, unit } = lengthParts(days);
  return n === 1 ? `first ${unit}` : `first ${n} ${unit}s`;
}

/** '30 days', '3 months', '1 year'. */
export function trialSpan(days: number): string {
  const { n, unit } = lengthParts(days);
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

/** '31 October' for '2026-10-31'. */
export function formatOfferDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

export function trialCopy(offer: TrialOffer, now: Date = new Date()): TrialCopy {
  const live = isPromoLive(offer.promo, now) ? offer.promo : null;
  const days = live ? live.days : offer.standardDays;
  const first = trialFirstPhrase(days);
  return {
    days,
    span: trialSpan(days),
    first,
    freeLabel: `F${first.slice(1)} free`,
    promo: live
      ? {
          label: live.label,
          endsLabel: live.endsOn ? formatOfferDay(live.endsOn) : null,
          endsToday: live.endsOn === todayForOffers(now),
          usualSpan: trialSpan(offer.standardDays),
        }
      : null,
  };
}

/**
 * Announcement for a running campaign, e.g. tag 'Autumn offer' + text
 * '3 months free instead of 30 days — sign up by 31 October' (or '— today
 * only' on its last day). null when none.
 */
export function promoHeadline(trial: TrialCopy): { tag: string; text: string } | null {
  if (!trial.promo) return null;
  const instead = trial.promo.usualSpan !== trial.span ? ` instead of ${trial.promo.usualSpan}` : '';
  const until = trial.promo.endsToday
    ? ' — today only'
    : trial.promo.endsLabel
      ? ` — sign up by ${trial.promo.endsLabel}`
      : '';
  return { tag: trial.promo.label || 'Limited offer', text: `${trial.span} free${instead}${until}` };
}

/** Copy for the default offer — for client components rendered without one. */
export const DEFAULT_TRIAL_COPY: TrialCopy = trialCopy(DEFAULT_TRIAL_OFFER);
