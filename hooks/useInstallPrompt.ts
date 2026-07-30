'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Home-screen install plumbing.
 *
 * Chrome/Edge/Samsung fire `beforeinstallprompt` ONCE, early — typically before
 * any dashboard component has mounted. Miss it and the app can never show an
 * install button for the rest of the page's life. So the event is captured at
 * module scope by initInstallCapture() (kicked off from the root layout, which
 * mounts on first paint) and parked here until some UI asks for it.
 *
 * That makes this a genuine external store, so components read it through
 * useSyncExternalStore rather than mirroring it into local state — no
 * setState-in-effect, and hydration is handled by the server snapshot below
 * (the server can't know any of this, so it reports "nothing to offer" and
 * React re-renders once with the real client values).
 *
 * iOS has no equivalent API — Safari only adds to the home screen from its own
 * Share sheet — so there we show instructions instead of a button. That's what
 * `isIos` is for.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** iOS Safari's non-standard "launched from home screen" flag. */
interface NavigatorStandalone extends Navigator {
  standalone?: boolean;
}

export interface InstallState {
  /** Client-side checks have run — nothing install-related should render before this. */
  ready: boolean;
  /** A native install prompt is queued and ready to fire. */
  canPrompt: boolean;
  /** Already running as an installed app, so there is nothing to offer. */
  standalone: boolean;
  /** Needs the manual Share → Add to Home Screen walkthrough. */
  isIos: boolean;
}

let deferredEvent: BeforeInstallPromptEvent | null = null;
let didInstall = false;
let listening = false;
const subscribers = new Set<() => void>();

function emit() {
  subscribers.forEach((fn) => fn());
}

/** Idempotent — safe to call from every client entry point. */
export function initInstallCapture(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;

  window.addEventListener('beforeinstallprompt', (e) => {
    // Suppress Chrome's own mini-infobar so we can ask at a moment that suits
    // the dashboard rather than mid-task.
    e.preventDefault();
    deferredEvent = e as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    didInstall = true;
    deferredEvent = null;
    emit();
  });
}

/** True when the page is running as an installed app rather than a browser tab. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const standaloneModes = ['standalone', 'fullscreen', 'minimal-ui'];
  const matchesMode = standaloneModes.some(
    (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
  );
  return matchesMode || (window.navigator as NavigatorStandalone).standalone === true;
}

/**
 * iPhone/iPad. iPadOS 13+ reports a Macintosh UA, so touch points disambiguate
 * an iPad from a real Mac (which needs no Add-to-Home-Screen instructions).
 */
export function isIosDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1;
}

const SERVER_SNAPSHOT: InstallState = {
  ready: false,
  canPrompt: false,
  standalone: false,
  isIos: false,
};

/**
 * Cached because useSyncExternalStore compares snapshots by identity — building
 * a fresh object on every render would loop forever.
 */
let snapshot: InstallState = SERVER_SNAPSHOT;

function getSnapshot(): InstallState {
  const canPrompt = deferredEvent !== null && !didInstall;
  const standalone = isStandaloneDisplay() || didInstall;
  const isIos = isIosDevice();

  if (
    !snapshot.ready ||
    snapshot.canPrompt !== canPrompt ||
    snapshot.standalone !== standalone ||
    snapshot.isIos !== isIos
  ) {
    snapshot = { ready: true, canPrompt, standalone, isIos };
  }
  return snapshot;
}

function getServerSnapshot(): InstallState {
  return SERVER_SNAPSHOT;
}

function subscribe(onChange: () => void): () => void {
  initInstallCapture();
  subscribers.add(onChange);

  // Installing from the browser's own menu (rather than our button) flips the
  // running tab to standalone without firing `appinstalled` here.
  const media = window.matchMedia('(display-mode: standalone)');
  media.addEventListener('change', onChange);

  return () => {
    subscribers.delete(onChange);
    media.removeEventListener('change', onChange);
  };
}

export function useInstallPrompt(): InstallState & {
  /** Fires the native prompt. Resolves true when the user accepted. */
  promptToInstall: () => Promise<boolean>;
} {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const promptToInstall = useCallback(async () => {
    const event = deferredEvent;
    if (!event) return false;

    // A deferred prompt is single-use: whatever the outcome it cannot be fired
    // again, so drop it and let subscribers hide their buttons.
    deferredEvent = null;
    emit();

    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      return outcome === 'accepted';
    } catch {
      return false;
    }
  }, []);

  return { ...state, promptToInstall };
}
