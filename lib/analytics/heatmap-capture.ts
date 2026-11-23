// =============================================================================
// Heatmap capture — records where visitors click and tap on public pages.
// =============================================================================
// Each click is stored twice over, so it can be redrawn faithfully later on a
// screen of any size:
//   • page coordinates (x / y from the top-left of the document, plus the
//     page's width and height at the time), and
//   • the element that was clicked — a short CSS path to it — and the spot
//     inside it (0–1000 across / down).
// The viewer prefers the element (it survives layout changes) and falls back
// to the coordinates when the element can't be found.
//
// Also flagged per click:
//   rage — 3+ clicks within 0.8 s on roughly the same spot (frustration);
//   dead — a click on something that isn't a link / button and after which
//          nothing on the page changed (people expected it to do something).
//
// Privacy: never what anyone types. Only an element's own label (a button's
// text, an image's alt, an aria-label) and only for links, buttons and short
// static text — with email addresses and long numbers masked. Anything inside
// [data-rv-mask] (the support chat, forms' free text) is recorded as a
// position only. Browsers sending Global Privacy Control are skipped entirely.
//
// Clicks go out in small batches (a few seconds after the last click, when 25
// have piled up, on route changes and when the tab is hidden) through the
// same /api/rv beacon as the rest of the analytics.
// =============================================================================

import { currentPageView, hasPrivacySignal, sendBeacon, trackingEnabled } from './client';

interface PendingClick {
  pv: string;
  path: string;
  at: number;
  x: number;
  y: number;
  vw: number;
  dw: number;
  dh: number;
  sel: string;
  rx: number;
  ry: number;
  tag: string;
  label: string | null;
  href: string | null;
  ms: number;
  rage: boolean;
  dead: boolean;
}

/** What counts as "meant to be clicked". Clicks elsewhere can be dead clicks. */
const INTERACTIVE =
  'a[href],button,input,select,textarea,label,summary,video,audio,' +
  '[role="button"],[role="tab"],[role="link"],[role="menuitem"],[role="checkbox"],[role="switch"],[role="option"],' +
  '[onclick],[data-track],[contenteditable="true"]';
const FIELD = 'input:not([type="button"]):not([type="submit"]):not([type="reset"]),textarea,select,[contenteditable="true"]';

const BATCH = 25;
const FLUSH_AFTER_MS = 2500;
const RAGE_WINDOW_MS = 800;
const RAGE_RADIUS_PX = 32;
const DEAD_WAIT_MS = 700;

let queue: PendingClick[] = [];
let recent: { x: number; y: number; t: number; item: PendingClick }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Emails and long numbers never leave the browser. */
function mask(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '•••')
    .replace(/\+?\d[\d\s().-]{4,}\d/g, '•••')
    .slice(0, 80);
}

/** An id worth anchoring on: readable, not generated (React's «r1» / :r1:). */
const goodId = (id: string) => /^[A-Za-z][\w-]{0,40}$/.test(id) && !/\d{4,}/.test(id);

/**
 * A short CSS path that finds this element again on the same page:
 * `#pricing>div:nth-of-type(2)>a`. Stops at the nearest stable id.
 */
export function selectorFor(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== document.documentElement && parts.length < 12) {
    if (cur.id && goodId(cur.id)) {
      parts.unshift(`#${cur.id}`);
      return parts.join('>');
    }
    if (cur === document.body) {
      parts.unshift('body');
      return parts.join('>');
    }
    const tag = cur.tagName.toLowerCase();
    const parent: Element | null = cur.parentElement;
    if (!parent) break;
    let index = 0;
    let same = 0;
    for (const child of Array.from(parent.children)) {
      if (child.tagName === cur.tagName) {
        same += 1;
        if (child === cur) index = same;
      }
    }
    parts.unshift(same > 1 ? `${tag}:nth-of-type(${index})` : tag);
    cur = parent;
  }
  return parts.join('>');
}

function labelFor(el: Element, interactive: boolean): string | null {
  if (el.closest('[data-rv-mask]')) return null;
  const attr =
    el.getAttribute('data-track-label') ||
    el.getAttribute('aria-label') ||
    (el instanceof HTMLImageElement ? el.alt : '') ||
    el.getAttribute('title');
  if (attr) return mask(attr) || null;
  if (el.matches(FIELD)) {
    // A form field: its name or placeholder — never what was typed.
    const f = el as HTMLInputElement;
    return mask(f.getAttribute('placeholder') || f.name || f.type || el.tagName.toLowerCase()) || null;
  }
  if (el instanceof HTMLInputElement) return mask(el.value) || null; // submit / button inputs
  const text = (el as HTMLElement).innerText ?? el.textContent ?? '';
  // Links and buttons: their visible text. Anything else: only short text
  // (a heading, a word in a card) — never a whole paragraph.
  if (interactive || text.length <= 80) return mask(text) || null;
  return null;
}

function hrefFor(el: Element): string | null {
  const a = el.closest('a[href]') as HTMLAnchorElement | null;
  if (!a) return null;
  const raw = a.getAttribute('href') ?? '';
  if (/^(mailto|tel|sms|whatsapp):/i.test(raw)) return raw.split(':')[0].toLowerCase() + ':';
  try {
    const url = new URL(a.href);
    return url.host === window.location.host ? (url.pathname + url.hash).slice(0, 200) : (url.host + url.pathname).slice(0, 200);
  } catch {
    return null;
  }
}

/** A click on something that isn't interactive is "dead" if nothing reacts. */
function watchForReaction(item: PendingClick) {
  const startUrl = window.location.href;
  const startScroll = window.scrollY;
  let reacted = false;
  const mo = new MutationObserver(() => {
    reacted = true;
    mo.disconnect();
  });
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  setTimeout(() => {
    mo.disconnect();
    if (!reacted && window.location.href === startUrl && Math.abs(window.scrollY - startScroll) < 4) item.dead = true;
  }, DEAD_WAIT_MS);
}

function schedule() {
  if (queue.length >= BATCH) {
    flushClicks();
    return;
  }
  if (timer) clearTimeout(timer);
  timer = setTimeout(flushClicks, FLUSH_AFTER_MS);
}

/** Send everything waiting — one beacon per page view, 25 clicks at most each. */
export function flushClicks() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!queue.length) return;
  const now = Date.now();
  const byView = new Map<string, PendingClick[]>();
  for (const c of queue) {
    const list = byView.get(c.pv);
    if (list) list.push(c);
    else byView.set(c.pv, [c]);
  }
  queue = [];
  for (const [pv, list] of byView) {
    for (let i = 0; i < list.length; i += BATCH) {
      const part = list.slice(i, i + BATCH);
      sendBeacon({
        t: 'clicks',
        p: part[0].path,
        pv,
        c: part.map((c) => ({
          x: c.x, y: c.y, vw: c.vw, dw: c.dw, dh: c.dh, sel: c.sel, rx: c.rx, ry: c.ry,
          tag: c.tag, label: c.label, href: c.href, ms: c.ms, ago: now - c.at, rage: c.rage, dead: c.dead,
        })),
      });
    }
  }
}

function onClick(e: MouseEvent) {
  if (!e.isTrusted) return;
  // Enter / Space on a focused button fires a click with no position.
  if (e.detail === 0 && e.clientX === 0 && e.clientY === 0) return;
  if (!trackingEnabled() || hasPrivacySignal()) return;
  const page = currentPageView();
  if (!page) return;
  const target = e.target instanceof Element ? e.target : null;
  if (!target || target.closest('[data-rv-no-heatmap]')) return;

  const interactive = target.closest(INTERACTIVE);
  const el = interactive ?? target;
  const rect = el.getBoundingClientRect();
  const doc = document.documentElement;
  const at = Date.now();
  const item: PendingClick = {
    pv: page.id,
    path: page.path,
    at,
    x: Math.round(e.pageX),
    y: Math.round(e.pageY),
    vw: window.innerWidth,
    dw: Math.max(doc.scrollWidth, doc.clientWidth),
    dh: Math.max(doc.scrollHeight, document.body?.scrollHeight ?? 0),
    sel: selectorFor(el),
    rx: rect.width ? clamp(Math.round(((e.clientX - rect.left) / rect.width) * 1000), 0, 1000) : 500,
    ry: rect.height ? clamp(Math.round(((e.clientY - rect.top) / rect.height) * 1000), 0, 1000) : 500,
    tag: el.tagName.toLowerCase().slice(0, 20),
    label: labelFor(el, !!interactive),
    href: hrefFor(el),
    ms: Math.max(0, at - page.openedAt),
    rage: false,
    dead: false,
  };

  // Rage clicks: this is the third (or later) click on one spot in a moment.
  recent = recent.filter((r) => at - r.t < RAGE_WINDOW_MS);
  const near = recent.filter((r) => Math.hypot(r.x - e.clientX, r.y - e.clientY) < RAGE_RADIUS_PX);
  recent.push({ x: e.clientX, y: e.clientY, t: at, item });
  if (near.length >= 2) {
    item.rage = true;
    for (const r of near) r.item.rage = true;
  }

  if (!interactive) watchForReaction(item);
  queue.push(item);
  schedule();
}

let installed = false;

/** Start recording clicks (once, from components/analytics/SiteAnalytics). */
export function installClickCapture(): () => void {
  if (installed || typeof window === 'undefined') return () => {};
  installed = true;
  const onHide = () => {
    if (document.visibilityState === 'hidden') flushClicks();
  };
  document.addEventListener('click', onClick, { capture: true, passive: true });
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', flushClicks);
  return () => {
    installed = false;
    flushClicks();
    document.removeEventListener('click', onClick, { capture: true });
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', flushClicks);
  };
}
