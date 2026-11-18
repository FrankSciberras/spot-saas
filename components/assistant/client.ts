'use client';

// =============================================================================
// ROVORA AI — browser side: open the panel, availability, streaming a question
// =============================================================================

import { useEffect, useState } from 'react';

/** Open the assistant from anywhere (topbar button, ⌘K palette, a page CTA). */
export const OPEN_EVENT = 'rovora:ask';

export function openAssistant(question?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { question } }));
}

export interface AssistantAvailability {
  /** Rovora AI is switched on for this fleet (beta list / module). */
  available: boolean;
  /** The plan includes it and the fleet isn't paused. */
  enabled?: boolean;
  /** Why not, in words safe to show. */
  message?: string | null;
  role?: 'admin' | 'staff';
  plan?: string;
  percent_used?: number;
  resets_on?: string;
  per_day?: number;
  /** Admins only. */
  budget_eur?: number;
  spent_eur?: number;
}

// One request per page load, shared by every component that asks (the topbar
// button, the palette and the panel all mount on every page).
let cached: Promise<AssistantAvailability> | null = null;
const listeners = new Set<(a: AssistantAvailability) => void>();

function load(): Promise<AssistantAvailability> {
  if (!cached) {
    cached = fetch('/api/assistant/usage', { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<AssistantAvailability>) : { available: false }))
      .catch(() => ({ available: false }));
  }
  return cached;
}

/** Re-read usage after a question so the allowance line stays current. */
export function refreshAvailability(patch?: Partial<AssistantAvailability>) {
  const prev = cached;
  cached = (prev ?? load()).then((a) => {
    const next = { ...a, ...patch };
    listeners.forEach((fn) => fn(next));
    return next;
  });
}

/** `enabled: false` skips the request entirely (e.g. on driver pages). */
export function useAssistantAvailability(enabled = true): AssistantAvailability | null {
  const [state, setState] = useState<AssistantAvailability | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    load().then((a) => alive && setState(a));
    const fn = (a: AssistantAvailability) => alive && setState(a);
    listeners.add(fn);
    return () => {
      alive = false;
      listeners.delete(fn);
    };
  }, [enabled]);
  return enabled ? state : null;
}

export interface Source {
  label: string;
  href: string;
}

export type StreamEvent =
  | { type: 'start'; conversation_id: string }
  | { type: 'status'; text: string }
  | { type: 'text'; delta: string }
  | { type: 'discard' }
  | {
      type: 'done';
      message_id: string | null;
      sources: Source[];
      usage?: { percent_used?: number; resets_on?: string; spent_eur?: number; budget_eur?: number };
    };

export type AskResult =
  | { ok: true }
  /** Refused before answering (rate limit, allowance, plan…): `message` is safe to show. */
  | { ok: false; message: string; reason: string };

/** Send a question and feed the streamed events to `onEvent`. */
export async function askAssistant(
  body: { question: string; conversation_id?: string | null; page?: { path: string } },
  onEvent: (ev: StreamEvent) => void,
  signal: AbortSignal,
): Promise<AskResult> {
  let res: Response;
  try {
    res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return { ok: true };
    return { ok: false, reason: 'network', message: 'Couldn’t reach Rovora AI — check your connection and try again.' };
  }

  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.includes('ndjson') || !res.body) {
    const data = (await res.json().catch(() => null)) as { message?: string; reason?: string } | null;
    return {
      ok: false,
      reason: data?.reason ?? `http_${res.status}`,
      message: data?.message ?? 'Rovora AI couldn’t answer just now. Please try again in a moment.',
    };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        try {
          onEvent(JSON.parse(line) as StreamEvent);
        } catch {
          // A line we can't parse isn't worth losing the answer over.
        }
      }
    }
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') {
      return { ok: false, reason: 'stream', message: 'The answer was cut off. Please ask again.' };
    }
  }
  return { ok: true };
}

export async function sendFeedback(messageId: string, value: 1 | -1 | 0): Promise<boolean> {
  try {
    const res = await fetch('/api/assistant/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message_id: messageId, value }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
