import type { IconName } from '../feature/icons';

/**
 * Content model for the long-form marketing pages: feature deep-dives under
 * /features/* and audience pages under /for/*.
 *
 * Each page answers, in this order, the questions a fleet owner actually has:
 * what is it, who is it for, what goes wrong without it, how is it used on a
 * normal day, what exactly is included, what it does NOT do, and the questions
 * people ask before signing up. Every claim must be true of the product as it
 * is in `main` today — check the changelog before writing one.
 */

export interface Qa {
  q: string;
  a: string;
}

export interface AudienceCard {
  /** Who this is, e.g. 'Owner-operators'. */
  who: string;
  /** Their situation, one sentence. */
  situation: string;
  /** What they get out of this feature, one sentence. */
  gets: string;
}

export interface MockRow {
  name: string;
  meta?: string;
  amt?: string;
  /** Status chip text. */
  st?: string;
  /** Amber "needs attention" chip instead of green. */
  idle?: boolean;
}

export interface Mock {
  /** Shown in the faux address bar after app.rovora.eu/ */
  path: string;
  title: string;
  pill?: string;
  rows: MockRow[];
}

export interface DeepContent {
  /** Canonical path, e.g. '/features/messages'. */
  path: string;
  /** Breadcrumb: parent crumb then this page. */
  crumb: { parent: { name: string; path: string }; name: string };
  eyebrow: string;
  /** H1 = `${title} ${accent}`; accent is drawn in green. */
  title: string;
  accent: string;
  sub: string;
  /** Three or four short proof points under the hero buttons. */
  proof: string[];
  mock: Mock;

  /** "Who it's for". */
  audienceTitle: string;
  audience: AudienceCard[];

  /** "What goes wrong without it" — optional. */
  painsTitle?: string;
  painsIntro?: string;
  pains?: { title: string; body: string }[];

  /** "How it's used" — a normal day or week, step by step. */
  stepsKicker: string;
  stepsTitle: string;
  stepsIntro?: string;
  steps: { title: string; body: string }[];

  /** "What's included" grid. */
  includedTitle: string;
  included: { icon: IconName; title: string; body: string }[];

  /** Honest limits — what it does not do (yet). */
  limits?: { title: string; body: string }[];

  faq: Qa[];
  /** Internal links to other marketing pages, by path. */
  related: string[];

  cta: { title: string; body: string };
}

/** Extra sections bolted onto the hand-written /features/* pages. */
export interface FeatureExtra {
  audienceTitle: string;
  audience: AudienceCard[];
  faq: Qa[];
  related: string[];
}
