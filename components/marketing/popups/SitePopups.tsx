'use client';

// =============================================================================
// Website pop-ups — mounted once in the root layout, public pages only.
// =============================================================================
// Asks /api/site-popups once per page load for the live pop-ups (set up in
// Admin Console → Popups), then on each page picks the best one that:
//   • covers this page and this kind of screen (phone / desktop),
//   • this visitor hasn't already seen (its "how often" rule), and
//   • isn't the second pop-up of this visit — never more than one per visit,
// and opens it on its trigger: after N seconds, after N % of scrolling, or as
// the mouse heads for the tab bar (exit intent; on phones, halfway down) —
// but never while the cookie banner is still asking; it waits for the answer.
//
// What was seen is remembered in this browser only (localStorage `rv_popups`,
// listed in the privacy policy). Showing, pressing and closing are counted
// as plain daily totals via /api/site-popups/hit — under the same rules as the
// rest of the analytics (no counting in development, inside frames, or for
// the admin's own "don't count my visits" browser).
//
// HEATMAPS: the open pop-up is `#rv-popup[data-rv-popup="<id>"]` with fixed
// ids on its parts (rv-popup-cta, rv-popup-close, …), so the click heatmap can
// tell a click on the pop-up from one on the page behind it. The viewer opens
// a pop-up in its frame with `?rv-popup-preview=<id>` or, same-origin,
// `window.__rvPopup.show(id)` / `.hide()` / `.current()`. Every open / close
// fires a `rovora:popup` window event with detail { id, open }.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { isAppRoute } from '@/lib/routes';
import { trackingEnabled } from '@/lib/analytics/client';
import { rovoraFontVars } from '@/lib/rovoraFonts';
import {
  MOBILE_MAX_WIDTH,
  POPUP_EVENT,
  POPUP_PREVIEW_PARAM,
  UUID_RE,
  pageMatches,
  popupAllowedOn,
  type PublicPopup,
} from '@/lib/popups/types';
import PopupCard, { type PopupCloseReason } from './PopupCard';
import styles from './SitePopups.module.css';

const SEEN_KEY = 'rv_popups';
const VISIT_KEY = 'rv_popups_visit';
const THEME_EVENT = 'rovora-theme-change';
const HIT_PATH = '/api/site-popups/hit';
/** Never open the instant a page appears — let it paint and be read first. */
const MIN_DELAY_MS = 1200;
/** Exit intent only counts once the visitor has been on the page a moment. */
const EXIT_ARM_MS = 3000;
const SEEN_KEEP_MS = 400 * 86_400_000;

type Seen = Record<string, { v: number; t: number }>;
interface OpenPopup {
  popup: PublicPopup;
  /** Forced open by an admin preview / the heatmap viewer: counts nothing, remembers nothing. */
  preview: boolean;
}

declare global {
  interface Window {
    __rvPopup?: {
      show: (id: string) => Promise<boolean>;
      hide: () => void;
      current: () => string | null;
    };
  }
}

// Private windows can refuse storage — fall back to memory for this page load.
const memory: { seen: Seen; visit: boolean } = { seen: {}, visit: false };

function readSeen(): Seen {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Seen) : {};
  } catch {
    return memory.seen;
  }
}

function rememberSeen(p: PublicPopup) {
  const now = Date.now();
  const seen = readSeen();
  for (const [k, v] of Object.entries(seen)) if (!v || typeof v.t !== 'number' || now - v.t > SEEN_KEEP_MS) delete seen[k];
  seen[p.id] = { v: p.version, t: now };
  memory.seen = seen;
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* memory only */
  }
}

function shownThisVisit(): boolean {
  try {
    return window.sessionStorage.getItem(VISIT_KEY) === '1';
  } catch {
    return memory.visit;
  }
}

function rememberVisit() {
  memory.visit = true;
  try {
    window.sessionStorage.setItem(VISIT_KEY, '1');
  } catch {
    /* memory only */
  }
}

/** Has this visitor's "how often" rule run out for this pop-up? */
function due(p: PublicPopup, seen: Seen): boolean {
  const last = seen[p.id];
  if (!last || last.v !== p.version) return true;
  if (p.frequency === 'once') return false;
  if (p.frequency === 'days') return Date.now() - last.t >= p.frequencyDays * 86_400_000;
  return true; // 'visit' — the one-per-visit rule already keeps it to once a visit
}

const isPhone = () => window.innerWidth <= MOBILE_MAX_WIDTH;

/** Shown inside a frame (the admin heatmap viewer): only open when asked to. */
function inFrame(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** The cookie banner is asking (it sets this class on <body> while open). */
const cookieBannerOpen = () => document.body.classList.contains('cookie-banner-open');

const siteTheme = (): 'light' | 'dark' =>
  document.querySelector('.rovora-site')?.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

function deviceFits(p: PublicPopup): boolean {
  return p.devices === 'all' || (p.devices === 'mobile') === isPhone();
}

function count(id: string, k: 'view' | 'click' | 'close') {
  if (!trackingEnabled()) return;
  const body = JSON.stringify({ id, k });
  try {
    if (navigator.sendBeacon?.(HIT_PATH, new Blob([body], { type: 'text/plain' }))) return;
  } catch {
    /* fall through */
  }
  void fetch(HIT_PATH, { method: 'POST', body, keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
}

function scrolledPct(): number {
  const doc = document.documentElement;
  const height = Math.max(doc.scrollHeight, document.body?.scrollHeight ?? 0);
  if (height <= window.innerHeight) return 100;
  return Math.round(((window.scrollY + window.innerHeight) / height) * 100);
}

async function fetchPopups(preview?: string): Promise<PublicPopup[]> {
  try {
    const res = await fetch(preview ? `/api/site-popups?preview=${encodeURIComponent(preview)}` : '/api/site-popups', {
      credentials: 'same-origin',
      cache: preview ? 'no-store' : 'default',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { popups?: PublicPopup[] };
    return Array.isArray(data.popups) ? data.popups : [];
  } catch {
    return [];
  }
}

export default function SitePopups() {
  const pathname = usePathname() ?? '/';
  const [popups, setPopups] = useState<PublicPopup[] | null>(null);
  const [open, setOpen] = useState<OpenPopup | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const openRef = useRef<OpenPopup | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const publicPage = !isAppRoute(pathname);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const show = useCallback((next: OpenPopup) => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTheme(siteTheme());
    setOpen(next);
    window.dispatchEvent(new CustomEvent(POPUP_EVENT, { detail: { id: next.popup.id, open: true } }));
    if (!next.preview) {
      rememberSeen(next.popup);
      rememberVisit();
      count(next.popup.id, 'view');
    }
  }, []);

  const hide = useCallback((reason: PopupCloseReason | 'cta' | 'api') => {
    const cur = openRef.current;
    if (!cur) return;
    setOpen(null);
    window.dispatchEvent(new CustomEvent(POPUP_EVENT, { detail: { id: cur.popup.id, open: false } }));
    if (!cur.preview && reason !== 'cta' && reason !== 'api') count(cur.popup.id, 'close');
    // Back to where the visitor was, unless the button is taking them elsewhere.
    if (reason !== 'cta') returnFocus.current?.focus?.({ preventScroll: true });
  }, []);

  // The live list — once per page load, on the first public page.
  useEffect(() => {
    if (popups !== null || !publicPage) return;
    // Never inside the Rovora Driver app's WebView.
    if ((window as Window & { ReactNativeWebView?: unknown }).ReactNativeWebView) return;
    let cancelled = false;
    void fetchPopups().then((list) => {
      if (!cancelled) setPopups(list);
    });
    return () => {
      cancelled = true;
    };
  }, [popups, publicPage]);

  // Forced open: ?rv-popup-preview=<id> (admin "Preview on the website", heatmap viewer).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get(POPUP_PREVIEW_PARAM);
    if (!id || !UUID_RE.test(id)) return;
    let cancelled = false;
    void fetchPopups(id).then(([p]) => {
      if (!cancelled && p) show({ popup: p, preview: true });
    });
    return () => {
      cancelled = true;
    };
  }, [show]);

  // Same-origin hooks for the heatmap viewer.
  useEffect(() => {
    window.__rvPopup = {
      show: async (id: string) => {
        if (!UUID_RE.test(id)) return false;
        const [p] = await fetchPopups(id);
        if (!p) return false;
        if (openRef.current) hide('api');
        show({ popup: p, preview: true });
        return true;
      },
      hide: () => hide('api'),
      current: () => openRef.current?.popup.id ?? null,
    };
    return () => {
      delete window.__rvPopup;
    };
  }, [show, hide]);

  // Pick this page's pop-up and wait for its trigger.
  useEffect(() => {
    if (!popups?.length || !publicPage || !popupAllowedOn(pathname) || openRef.current) return;
    if (shownThisVisit() || inFrame()) return;
    const seen = readSeen();
    const popup = popups.find((p) => pageMatches(p.pages, pathname) && deviceFits(p) && due(p, seen));
    if (!popup) return;

    const openedAt = Date.now();
    let done = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const cleanups: (() => void)[] = [];
    const open = () => {
      if (!openRef.current && !shownThisVisit()) show({ popup, preview: false });
    };
    const fire = () => {
      if (done || openRef.current || shownThisVisit()) return;
      done = true;
      const wait = Math.max(0, MIN_DELAY_MS - (Date.now() - openedAt));
      timers.push(setTimeout(() => {
        if (!cookieBannerOpen()) {
          open();
          return;
        }
        // One question at a time: wait for the cookie answer, then a beat.
        const mo = new MutationObserver(() => {
          if (cookieBannerOpen()) return;
          mo.disconnect();
          timers.push(setTimeout(open, MIN_DELAY_MS));
        });
        mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        cleanups.push(() => mo.disconnect());
      }, wait));
    };

    const onScrollTo = (pct: number) => {
      const check = () => {
        if (scrolledPct() >= pct) fire();
      };
      window.addEventListener('scroll', check, { passive: true });
      cleanups.push(() => window.removeEventListener('scroll', check));
      // Short pages are "scrolled" from the start.
      timers.push(setTimeout(check, 400));
    };

    if (popup.trigger === 'delay') {
      timers.push(setTimeout(fire, popup.triggerValue * 1000));
    } else if (popup.trigger === 'scroll') {
      onScrollTo(popup.triggerValue);
    } else if (isPhone() || window.matchMedia('(pointer: coarse)').matches) {
      // No mouse to leave with — halfway down the page instead.
      onScrollTo(50);
    } else {
      const onOut = (e: globalThis.MouseEvent) => {
        if (e.relatedTarget || e.clientY > 8 || Date.now() - openedAt < EXIT_ARM_MS) return;
        fire();
      };
      document.addEventListener('mouseout', onOut);
      cleanups.push(() => document.removeEventListener('mouseout', onOut));
    }

    return () => {
      done = true;
      timers.forEach(clearTimeout);
      cleanups.forEach((fn) => fn());
    };
  }, [popups, pathname, publicPage, show]);

  // A real pop-up closes when the visitor moves to another page; a preview stays.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (openRef.current && !openRef.current.preview) hide('api');
  }, [pathname, hide]);

  // Esc closes; Tab stays inside a centred pop-up; focus moves to it on open.
  useEffect(() => {
    if (!open) return;
    const modal = open.popup.layout === 'modal';
    if (modal) requestAnimationFrame(() => cardRef.current?.focus({ preventScroll: true }));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hide('escape');
        return;
      }
      if (!modal || e.key !== 'Tab' || !cardRef.current) return;
      const items = Array.from(cardRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === cardRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, hide]);

  // Follow the marketing site's light/dark toggle while open.
  useEffect(() => {
    if (!open) return;
    const onTheme = (e: Event) => setTheme((e as CustomEvent<'light' | 'dark'>).detail === 'dark' ? 'dark' : 'light');
    window.addEventListener(THEME_EVENT, onTheme);
    return () => window.removeEventListener(THEME_EVENT, onTheme);
  }, [open]);

  if (!open || (!publicPage && !open.preview)) return null;
  const { popup } = open;
  const modal = popup.layout === 'modal';

  const onCta = () => {
    if (!open.preview) count(popup.id, 'click');
    hide('cta');
  };

  return (
    <div
      id="rv-popup"
      data-rv-popup={popup.id}
      data-rv-popup-name={popup.name}
      data-rv-popup-layout={popup.layout}
      data-theme={theme}
      className={`${styles.root} ${modal ? styles.modal : `${styles.slide} ${styles.compact}`} ${rovoraFontVars}`}
    >
      {modal && <div id="rv-popup-backdrop" className={styles.backdrop} onClick={() => hide('backdrop')} aria-hidden="true" />}
      <PopupCard popup={popup} live modal={modal} cardRef={cardRef} onClose={hide} onCta={onCta} />
    </div>
  );
}
