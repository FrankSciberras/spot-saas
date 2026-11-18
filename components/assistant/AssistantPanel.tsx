'use client';

// =============================================================================
// ROVORA AI — the chat panel (side panel on desktop, full screen on phones)
// =============================================================================
// Mounted once per page by FleetShell. Opens from the topbar "Ask AI" button,
// the ⌘K palette, or anything that calls openAssistant(). The thread lives in
// sessionStorage so it survives moving between dashboard pages (FleetShell
// remounts on every page) and is gone when the tab closes; the server keeps
// the real history.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useFleetTheme } from '@/components/fleet/FleetThemeRoot';
import { useEnabledModules } from '@/components/fleet/FleetModulesProvider';
import AssistantMarkdown from './AssistantMarkdown';
import SparkleIcon from './SparkleIcon';
import {
  OPEN_EVENT,
  askAssistant,
  refreshAvailability,
  sendFeedback,
  useAssistantAvailability,
  type Source,
} from './client';
import styles from './assistant.module.css';

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** "Checking bookkeeping…" while the answer is being looked up. */
  status?: string;
  streaming?: boolean;
  sources?: Source[];
  messageId?: string | null;
  /** A refusal / limit message rather than an answer. */
  notice?: boolean;
  feedback?: 1 | -1;
}

const STORE_KEY = 'rovora_ai_thread_v1';
const MAX_STORED = 40;
const MAX_CHARS = 1000;

interface Stored {
  open: boolean;
  conversationId: string | null;
  messages: Msg[];
}

function readStore(): Stored | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    // An answer that was mid-stream when the page changed won't resume.
    s.messages = (s.messages ?? []).map((m) =>
      m.streaming
        ? { ...m, streaming: false, status: undefined, text: m.text || 'This answer was interrupted — ask again.', notice: !m.text }
        : m,
    );
    return s;
  } catch {
    return null;
  }
}

// True only in the browser, after hydration (the portal needs document.body).
const noopSubscribe = () => () => {};
const useMounted = () => useSyncExternalStore(noopSubscribe, () => true, () => false);

function writeStore(s: Stored) {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify({ ...s, messages: s.messages.slice(-MAX_STORED) }));
  } catch {
    // Private mode / quota — the thread just won't survive a page change.
  }
}

const uid = () => Math.random().toString(36).slice(2, 10);

function formatDay(iso?: string) {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export default function AssistantPanel() {
  const avail = useAssistantAvailability();
  const { theme } = useFleetTheme();
  const modules = useEnabledModules();
  const pathname = usePathname();

  const mounted = useMounted();
  // The thread survives page changes via sessionStorage (read once, on the client).
  const [restored] = useState(readStore);
  const [open, setOpen] = useState(restored?.open ?? false);
  const [messages, setMessages] = useState<Msg[]>(restored?.messages ?? []);
  const [conversationId, setConversationId] = useState<string | null>(restored?.conversationId ?? null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingQuestion = useRef<string | null>(null);

  useEffect(() => {
    if (mounted) writeStore({ open, conversationId, messages });
  }, [mounted, open, conversationId, messages]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const patchLast = useCallback((fn: (m: Msg) => Msg) => {
    setMessages((list) => {
      if (!list.length) return list;
      const next = list.slice();
      next[next.length - 1] = fn(next[next.length - 1]);
      return next;
    });
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim().slice(0, MAX_CHARS);
      if (!question || busy) return;
      setInput('');
      setBusy(true);
      setMessages((list) => [
        ...list,
        { id: uid(), role: 'user', text: question },
        { id: uid(), role: 'assistant', text: '', streaming: true, status: 'Thinking…' },
      ]);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const result = await askAssistant(
        { question, conversation_id: conversationId, page: { path: pathname } },
        (ev) => {
          switch (ev.type) {
            case 'start':
              setConversationId(ev.conversation_id);
              break;
            case 'status':
              patchLast((m) => ({ ...m, status: ev.text }));
              break;
            case 'text':
              patchLast((m) => ({ ...m, text: m.text + ev.delta, status: undefined }));
              break;
            case 'discard':
              patchLast((m) => ({ ...m, text: '' }));
              break;
            case 'done':
              patchLast((m) => ({ ...m, streaming: false, status: undefined, sources: ev.sources, messageId: ev.message_id }));
              if (ev.usage) refreshAvailability(ev.usage);
              break;
          }
        },
        ctrl.signal,
      );

      if (!result.ok) {
        patchLast((m) => ({ ...m, text: result.message, notice: true, streaming: false, status: undefined }));
      } else {
        // Stopped by the user, or the stream ended without a "done".
        patchLast((m) => (m.streaming ? { ...m, streaming: false, status: undefined, text: m.text || 'Stopped.', notice: !m.text } : m));
      }
      abortRef.current = null;
      setBusy(false);
    },
    [busy, conversationId, pathname, patchLast],
  );

  // Open requests from the topbar button, the palette, or anywhere else.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const q = (e as CustomEvent<{ question?: string }>).detail?.question;
      setOpen(true);
      if (q) pendingQuestion.current = q;
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  // Send a question handed over by openAssistant() once the panel is ready.
  useEffect(() => {
    if (open && mounted && !busy && pendingQuestion.current && avail?.enabled) {
      const q = pendingQuestion.current;
      pendingQuestion.current = null;
      void send(q);
    }
  }, [open, mounted, busy, avail?.enabled, send]);

  // Esc closes (unless a modal on top of us has focus).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[aria-modal="true"]')) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const newChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    setInput('');
    inputRef.current?.focus();
  };

  const rate = async (msg: Msg, value: 1 | -1) => {
    if (!msg.messageId) return;
    const next = msg.feedback === value ? 0 : value;
    setMessages((list) => list.map((m) => (m.id === msg.id ? { ...m, feedback: next === 0 ? undefined : next } : m)));
    await sendFeedback(msg.messageId, next);
  };

  const starters = useMemo(() => {
    const isAdmin = avail?.role === 'admin';
    const out: string[] = [];
    const onDriver = /^\/fleet\/drivers\/[0-9a-f-]{36}/i.test(pathname);
    const onVehicle = /^\/fleet\/vehicles\/[0-9a-f-]{36}/i.test(pathname);
    if (onDriver) out.push('How is this driver doing this month?');
    if (onVehicle) out.push(isAdmin && modules.has('bookkeeping') ? 'What has this car cost this year?' : 'When is this car’s next service?');
    if (isAdmin && modules.has('bookkeeping')) out.push('Which car cost me the most last month?');
    out.push('Who hasn’t done a pre-shift check this week?');
    out.push('What documents expire in the next 30 days?');
    if (modules.has('maintenance')) out.push('Which vehicles are due for a service?');
    if (isAdmin && modules.has('bolt')) out.push('How did Bolt do this week vs last week?');
    if (!isAdmin) out.push('Give me a quick overview of the fleet today');
    return out.slice(0, 4);
  }, [avail?.role, modules, pathname]);

  if (!mounted || !avail?.available || !open) return null;

  const usageLine =
    avail.enabled && avail.percent_used !== undefined
      ? avail.role === 'admin' && avail.budget_eur !== undefined
        ? `€${(avail.spent_eur ?? 0).toFixed(2)} of €${avail.budget_eur.toFixed(2)} used this month · renews ${formatDay(avail.resets_on)}`
        : `${Math.round(avail.percent_used)}% of this month’s allowance used`
      : null;

  return createPortal(
    // Portalled to <body>, outside .fleetTheme — re-apply it so tokens resolve.
    <div className={`fleetTheme ${styles.root}`} data-fleet-theme={theme}>
      <aside className={styles.panel} role="complementary" aria-label="Rovora AI assistant">
        <header className={styles.header}>
          <span className={styles.mark}>
            <SparkleIcon size={16} />
          </span>
          <div className={styles.titleWrap}>
            <span className={styles.title}>Rovora AI</span>
            <span className={styles.beta}>Beta</span>
          </div>
          <button type="button" className={styles.iconBtn} onClick={newChat} disabled={!messages.length} title="New chat" aria-label="New chat">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
            </svg>
          </button>
          <button type="button" className={styles.iconBtn} onClick={() => setOpen(false)} title="Close (Esc)" aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className={styles.body} ref={listRef} aria-live="polite">
          {messages.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>Ask anything about your fleet</p>
              <p className={styles.emptyText}>
                Answers come from your live dashboard data — drivers, vehicles, shifts, services
                {avail.role === 'admin' ? ', bookkeeping and settlements' : ''} — with links to the records behind them.
              </p>
              {avail.enabled && (
                <div className={styles.starters}>
                  {starters.map((s) => (
                    <button key={s} type="button" className={styles.starter} onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className={styles.userMsg}>
                  {m.text}
                </div>
              ) : (
                <div key={m.id} className={`${styles.aiMsg} ${m.notice ? styles.notice : ''}`}>
                  {m.text ? <AssistantMarkdown text={m.text} /> : null}
                  {m.streaming && (
                    <div className={styles.status}>
                      <span className={styles.dots} aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                      {m.status ?? (m.text ? '' : 'Thinking…')}
                    </div>
                  )}
                  {!m.streaming && m.sources && m.sources.length > 0 && (
                    <div className={styles.sources}>
                      <span className={styles.sourcesLabel}>Sources</span>
                      {m.sources.map((s) => (
                        <Link
                          key={s.href}
                          href={s.href}
                          className={styles.sourceChip}
                          onClick={() => {
                            if (window.innerWidth < 720) setOpen(false);
                          }}
                        >
                          {s.label}
                        </Link>
                      ))}
                    </div>
                  )}
                  {!m.streaming && m.messageId && (
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={`${styles.thumb} ${m.feedback === 1 ? styles.thumbOn : ''}`}
                        onClick={() => rate(m, 1)}
                        aria-label="Good answer"
                        aria-pressed={m.feedback === 1}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M7 10v11H4V10zM7 10l4-7a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 17.6 21H7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={`${styles.thumb} ${m.feedback === -1 ? styles.thumbOn : ''}`}
                        onClick={() => rate(m, -1)}
                        aria-label="Bad answer"
                        aria-pressed={m.feedback === -1}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M17 14V3h3v11zM17 14l-4 7a2 2 0 0 1-3-2l1-5H5a2 2 0 0 1-2-2.3l1.4-7A2 2 0 0 1 6.4 3H17" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              ),
            )
          )}
        </div>

        {avail.enabled ? (
          <form
            className={styles.composer}
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <textarea
              ref={inputRef}
              className={styles.input}
              value={input}
              rows={1}
              maxLength={MAX_CHARS}
              placeholder="Ask about drivers, cars, shifts, costs…"
              aria-label="Ask Rovora AI"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send(input);
                }
              }}
            />
            {busy ? (
              <button type="button" className={styles.sendBtn} onClick={() => abortRef.current?.abort()} aria-label="Stop">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            ) : (
              <button type="submit" className={styles.sendBtn} disabled={!input.trim()} aria-label="Send">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            )}
          </form>
        ) : (
          <div className={styles.unavailable}>{avail.message ?? 'Rovora AI isn’t available for your fleet right now.'}</div>
        )}

        <footer className={styles.footer}>
          {usageLine && <span>{usageLine}</span>}
          <span>Answers come from your fleet’s data — check important numbers on the linked pages.</span>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
