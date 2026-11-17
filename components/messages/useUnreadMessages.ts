'use client';

import { useSyncExternalStore } from 'react';

/**
 * Unread-message count for the menu badges (topbar button, sidebar item,
 * bottom tab). One shared poller per page no matter how many badges are
 * mounted: every 30s while the tab is visible, plus immediately whenever the
 * chat screen fires `rovora:messages-unread` (after reading a chat) or the
 * window regains focus.
 *
 * Polling, not Realtime, on purpose: a live socket on every page for a badge
 * would burn Realtime connections; the chat screen itself is live.
 */

export interface UnreadState {
  /** null until the first answer — badges stay hidden rather than flicker. */
  enabled: boolean | null;
  count: number;
}

const EVENT = 'rovora:messages-unread';
const POLL_MS = 30_000;

let state: UnreadState = { enabled: null, count: 0 };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

function emit(next: UnreadState) {
  if (next.enabled === state.enabled && next.count === state.count) return;
  state = next;
  listeners.forEach((l) => l());
}

async function refresh() {
  if (inFlight || typeof document === 'undefined' || document.visibilityState === 'hidden') return;
  inFlight = true;
  try {
    const res = await fetch('/api/messages/unread', { cache: 'no-store' });
    if (res.ok) {
      const data = (await res.json()) as { enabled?: boolean; count?: number };
      emit({ enabled: !!data.enabled, count: Math.max(0, Number(data.count) || 0) });
    }
  } catch {
    // Offline — keep the last known count.
  } finally {
    inFlight = false;
  }
}

function start() {
  void refresh();
  timer = setInterval(refresh, POLL_MS);
  window.addEventListener(EVENT, refresh);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  window.removeEventListener(EVENT, refresh);
  window.removeEventListener('focus', refresh);
  document.removeEventListener('visibilitychange', refresh);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

const getSnapshot = () => state;
const SERVER_STATE: UnreadState = { enabled: null, count: 0 };
const getServerSnapshot = () => SERVER_STATE;

export function useUnreadMessages(): UnreadState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Ask every badge on the page to re-check now (e.g. right after reading a chat). */
export function refreshUnreadMessages() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT));
}

/** "3", or "99+" for big numbers. */
export function badgeText(count: number): string {
  return count > 99 ? '99+' : String(count);
}
