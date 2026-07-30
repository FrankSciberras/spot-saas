'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { chatSignupAction, chatVerifyCodeAction, resendSignupCodeAction, type SignupVerifyType } from '@/lib/actions/auth-email';
import { submitChatLeadAction } from '@/lib/actions/contact';

// =============================================================================
// ROVORA WEBSITE ASSISTANT
// =============================================================================
// The assistant is the site's front-of-house salesperson, so it does more than
// answer questions: it can put real buttons under a reply and complete the two
// actions that matter — starting a trial and reaching the team — WITHOUT the
// visitor ever leaving the chat.
//
// How the buttons get there: the model ends a reply with a machine-readable
// line, e.g. "[[chips: trial]]" / "[[ask: What would 8 cars cost?]]". We strip
// those lines out of the visible text and render them as controls. Only the four
// whitelisted chips below can ever render, so a confused (or manipulated) model
// can't invent a button that goes somewhere unexpected.
//
// The reply STREAMS in token by token (see /api/support-chat). That means the
// protocol line is also arriving one character at a time, so while a reply is in
// flight we additionally hide any half-written "[[…" tail — otherwise visitors
// would watch "[[chips: tri" type itself out at the end of every answer.
// =============================================================================

type ChipId = 'trial' | 'demo' | 'human' | 'pricing';
type Msg = {
  id: number;
  from: 'bot' | 'user';
  /** Raw model output while streaming; cleaned prose once settled. */
  text: string;
  chips?: ChipId[];
  asks?: string[];
  /** True only for the reply currently being written. */
  streaming?: boolean;
};
/** Which in-chat form, if any, is currently open. */
type Panel = null | 'signup' | 'lead';

const SALES_EMAIL = 'hello@rovora.eu';
const TRIAL_DAYS = 30;

// ── Tiny, safe Markdown renderer ─────────────────────────────────────────────
// The assistant replies in light Markdown (links, **bold**, bullet/numbered
// lists, paragraphs). We render that subset to React elements — no
// dangerouslySetInnerHTML, so there's no XSS surface. Anything we don't handle
// just falls through as plain text.

// Inline: **bold** and [label](url). Returns React nodes for one line of text.
function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Match a Markdown link OR a **bold** span, in order of appearance.
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] && m[2]) {
      nodes.push(
        <a key={`${keyBase}-a${i}`} href={m[2]} target="_blank" rel="noopener noreferrer">
          {m[1]}
        </a>,
      );
    } else if (m[3]) {
      nodes.push(<strong key={`${keyBase}-b${i}`}>{m[3]}</strong>);
    }
    last = m.index + m[0].length;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// Block-level: group lines into paragraphs and bullet / numbered lists.
function renderMarkdown(text: string): ReactNode {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let k = 0;

  const flushPara = () => {
    if (para.length) {
      blocks.push(<p key={`p${k++}`}>{renderInline(para.join(' '), `p${k}`)}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((it, idx) => <li key={idx}>{renderInline(it, `l${k}-${idx}`)}</li>);
      blocks.push(list.ordered ? <ol key={`o${k++}`}>{items}</ol> : <ul key={`u${k++}`}>{items}</ul>);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet) {
      flushPara();
      if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; }
      list.items.push(bullet[1]);
    } else if (numbered) {
      flushPara();
      if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; }
      list.items.push(numbered[1]);
    } else if (line === '') {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks;
}

// ── The model's button protocol ──────────────────────────────────────────────

const CHIP_IDS: ChipId[] = ['trial', 'demo', 'human', 'pricing'];
const MAX_ASKS = 3;

/**
 * Pulls the trailing "[[chips: …]]" / "[[ask: …]]" directives out of a finished
 * reply and returns the prose alongside the controls they asked for. Unknown
 * chips are dropped, and any stray bracket directive is scrubbed so a model slip
 * can never leak protocol text into the bubble.
 */
function parseReply(raw: string): { text: string; chips: ChipId[]; asks: string[] } {
  let chips: ChipId[] = [];
  let asks: string[] = [];

  const chipLine = /\[\[\s*chips?\s*:([^\]]*)\]\]/i.exec(raw);
  if (chipLine) {
    chips = chipLine[1]
      .split(/[|,]/)
      .map((s) => s.trim().toLowerCase())
      .filter((s): s is ChipId => (CHIP_IDS as string[]).includes(s))
      .filter((s, i, arr) => arr.indexOf(s) === i)
      .slice(0, 2);
  }

  const askLine = /\[\[\s*asks?\s*:([^\]]*)\]\]/i.exec(raw);
  if (askLine) {
    asks = askLine[1]
      .split('|')
      .map((s) => s.trim().replace(/^["'“”]|["'“”]$/g, ''))
      .filter((s) => s.length > 2 && s.length <= 60)
      .slice(0, MAX_ASKS);
  }

  const text = raw.replace(/\[\[[^\]]*\]\]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return { text, chips, asks };
}

/**
 * What to show for a reply that is still arriving: finished directives removed,
 * and anything after a half-typed "[[" held back until we know what it is.
 */
function visibleWhileStreaming(raw: string): string {
  const settled = raw.replace(/\[\[[^\]]*\]\]/g, '');
  const openAt = settled.lastIndexOf('[[');
  const safe = openAt === -1 ? settled : settled.slice(0, openAt);
  // A lone trailing "[" is very likely the start of the next directive.
  return safe.replace(/\[$/, '').replace(/\n{3,}/g, '\n\n').trimEnd();
}

const CHIP_LABEL: Record<ChipId, string> = {
  trial: 'Start my free trial',
  demo: 'Book a demo',
  human: 'Talk to a real person',
  pricing: 'See all pricing',
};

// ── Conversation persistence ─────────────────────────────────────────────────
// Visitors lose their thread on any reload — an accidental refresh, a flaky
// mobile connection, or clicking through to /pricing and coming back. We keep it
// on the DEVICE in localStorage.
//
// Deliberately NOT stored server-side against the visitor's IP: IPs are shared
// (office Wi-Fi, mobile carriers, NAT), so one visitor would be handed another's
// conversation, and it would mean holding chat transcripts + IPs — personal data
// — for an anonymous public page. localStorage is per-device, per-browser, needs
// no consent banner, and never leaves the visitor's machine.

const STORE_KEY = 'rovora_chat_v2';
const LEGACY_STORE_KEY = 'rovora_chat_v1'; // pre-chips threads; dropped on sight
const NUDGE_KEY = 'rovora_chat_nudge_v1';
const STORE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // forget a conversation after a week
const STORE_MAX_MSGS = 60; // keep the stored thread small
const NUDGE_AFTER_MS = 22_000; // how long a visitor reads before we offer help
const NUDGE_COOLDOWN_MS = 24 * 60 * 60 * 1000; // at most one nudge a day

type Saved = { v: 2; savedAt: number; msgs: Msg[] };

function loadSaved(): Saved | null {
  try {
    window.localStorage.removeItem(LEGACY_STORE_KEY);
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Saved> | null;
    if (!parsed || parsed.v !== 2 || !Array.isArray(parsed.msgs) || typeof parsed.savedAt !== 'number') {
      return null;
    }
    if (Date.now() - parsed.savedAt > STORE_TTL_MS) {
      window.localStorage.removeItem(STORE_KEY);
      return null;
    }
    // Trust nothing that came back out of storage — it's user-writable. Chips in
    // particular are re-validated against the whitelist, never taken on trust.
    const msgs = parsed.msgs
      .filter(
        (m): m is Msg =>
          !!m && typeof m.id === 'number' && typeof m.text === 'string' && (m.from === 'bot' || m.from === 'user'),
      )
      .map((m) => ({
        ...m,
        streaming: false,
        chips: Array.isArray(m.chips) ? m.chips.filter((c) => (CHIP_IDS as string[]).includes(c)) : undefined,
        asks: Array.isArray(m.asks) ? m.asks.filter((a) => typeof a === 'string').slice(0, MAX_ASKS) : undefined,
      }));
    if (!msgs.length) return null;
    return { v: 2, savedAt: parsed.savedAt, msgs };
  } catch {
    return null;
  }
}

function saveThread(msgs: Msg[]) {
  try {
    const payload: Saved = { v: 2, savedAt: Date.now(), msgs: msgs.slice(-STORE_MAX_MSGS) };
    window.localStorage.setItem(STORE_KEY, JSON.stringify(payload));
  } catch {
    // Private mode, quota, or storage disabled. Persistence is a nicety —
    // never let it break the chat itself.
  }
}

/** Recent conversation, oldest first, attached to a lead so sales has context. */
function transcriptOf(msgs: Msg[]): string {
  return msgs
    .slice(-10)
    .map((m) => `${m.from === 'user' ? 'Visitor' : 'Assistant'}: ${m.text}`)
    .join('\n\n');
}

const GREETING: Msg = {
  id: 0,
  from: 'bot',
  text: `Hi! 👋 I'm Rovora's assistant. Tell me how many vehicles you run and I'll tell you exactly what it would cost — or start your free ${TRIAL_DAYS}-day trial right now, no card needed.`,
  chips: ['trial'],
  asks: ['What would 8 cars cost?', 'How does driver pay work?', 'Do I need GPS trackers?'],
};

const FLEET_SIZES = ['1–5 vehicles', '6–15 vehicles', '16–50 vehicles', '50+ vehicles'];

export default function RovoraSupportChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [draft, setDraft] = useState('');
  /** Waiting on the first token — distinct from streaming, which has text. */
  const [thinking, setThinking] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [signedUp, setSignedUp] = useState(false);
  const [nudge, setNudge] = useState(false);
  const nextId = useRef(1);
  const restored = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Whether the transcript should follow new text. Goes false the moment the
  // visitor scrolls up to re-read something — yanking them back mid-sentence is
  // the single most irritating thing a streaming chat can do.
  const stick = useRef(true);

  const busy = thinking || streaming;

  // Pull the saved thread back the first time the visitor opens the panel.
  // Deliberately done here rather than in a mount effect: the server and the
  // first client render then stay identical (localStorage doesn't exist during
  // SSR), so there's no hydration mismatch and no cascading re-render.
  function restoreOnce() {
    if (restored.current) return;
    restored.current = true;
    const saved = loadSaved();
    if (!saved) return;
    setMsgs(saved.msgs);
    nextId.current = saved.msgs.reduce((max, m) => Math.max(max, m.id), 0) + 1;
  }

  function openChat() {
    restoreOnce();
    setNudge(false);
    setOpen(true);
  }

  function toggleOpen() {
    if (open) { setOpen(false); return; }
    openChat();
  }

  // Persist on every change — but never before the restore pass has run, or we'd
  // overwrite a saved thread with the empty starting state. Skipped mid-stream:
  // a half-written reply isn't worth storing sixty times a second.
  useEffect(() => {
    if (!restored.current || streaming) return;
    if (msgs.length <= 1) return; // nothing worth keeping yet
    saveThread(msgs);
  }, [msgs, streaming]);

  const scrollToEnd = useCallback((smooth: boolean) => {
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Follow the conversation, but only while the visitor is still at the bottom.
  // Jumps are instant while text streams (smooth scrolling can't keep up with
  // token-rate updates and visibly stutters) and smooth otherwise.
  useEffect(() => {
    if (stick.current) scrollToEnd(!streaming);
  }, [msgs, thinking, panel, scrollToEnd, streaming]);

  function onBodyScroll() {
    const el = bodyRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 72;
  }

  useEffect(() => {
    if (open && !panel) taRef.current?.focus();
  }, [open, panel]);

  // Grow the composer with the message, up to a few lines.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 116)}px`;
  }, [draft]);

  // Don't leave a request running against an unmounted component.
  useEffect(() => () => abortRef.current?.abort(), []);

  // A visitor who has been reading for a while is exactly who a salesperson
  // would walk over to. One teaser, at most once a day, dismissible — never the
  // full panel forcing itself open over what they're reading.
  useEffect(() => {
    if (open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      try {
        const last = Number(window.localStorage.getItem(NUDGE_KEY) || 0);
        if (Date.now() - last < NUDGE_COOLDOWN_MS) return;
        if (window.localStorage.getItem(STORE_KEY)) return; // already talked to us
        window.localStorage.setItem(NUDGE_KEY, String(Date.now()));
      } catch {
        return; // storage blocked — don't risk nagging on every page view
      }
      if (!cancelled) setNudge(true);
    }, NUDGE_AFTER_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open]);

  // Wipe the thread from this device — also the visitor's privacy control.
  function startOver() {
    abortRef.current?.abort();
    try {
      window.localStorage.removeItem(STORE_KEY);
    } catch {
      /* storage unavailable — the in-memory reset below still applies */
    }
    nextId.current = 1;
    setMsgs([GREETING]);
    setDraft('');
    setPanel(null);
    stick.current = true;
    taRef.current?.focus();
  }

  function pushBot(text: string) {
    setMsgs((m) => [...m, { id: nextId.current++, from: 'bot', text }]);
  }

  /** Settle a streamed reply: split the prose from the buttons it asked for. */
  function finalise(id: number, raw: string) {
    const { text, chips, asks } = parseReply(raw);
    setMsgs((m) =>
      m.map((msg) =>
        msg.id === id
          ? {
              ...msg,
              text: text || "Sorry — I didn't manage to answer that. A real person can help.",
              // Always leave a route to a human, even when the model forgot one.
              chips: chips.length ? chips : ['human'],
              asks,
              streaming: false,
            }
          : msg,
      ),
    );
  }

  async function ask(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;

    const userMsg: Msg = { id: nextId.current++, from: 'user', text: clean };
    const history = [...msgs, userMsg];
    const replyId = nextId.current++;

    setMsgs(history);
    setDraft('');
    setPanel(null);
    setThinking(true);
    stick.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    let raw = '';

    try {
      const res = await fetch('/api/support-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          // Send the conversation (minus the opening greeting) as the model history.
          messages: history
            .filter((m) => m.id !== 0)
            .map((m) => ({ role: m.from === 'user' ? 'user' : 'assistant', content: m.text })),
          // Lets the assistant open on something relevant to what they're reading.
          page: pathname,
        }),
      });

      if (!res.body) throw new Error('no stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let started = false;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += decoder.decode(value, { stream: true });
        if (!raw.trim()) continue;

        if (!started) {
          // First real token: swap the thinking dots for the live reply.
          started = true;
          setThinking(false);
          setStreaming(true);
          setMsgs((m) => [...m, { id: replyId, from: 'bot', text: raw, streaming: true }]);
        } else {
          setMsgs((m) => m.map((msg) => (msg.id === replyId ? { ...msg, text: raw } : msg)));
        }
      }
    } catch (err) {
      // A visitor pressing "stop" is not an error — keep whatever arrived.
      const aborted = err instanceof Error && err.name === 'AbortError';
      if (!aborted && !raw) {
        setMsgs((m) => [
          ...m,
          {
            id: replyId,
            from: 'bot',
            text: "I couldn't reach our assistant just now. Leave your details below and we'll come straight back to you.",
            chips: ['human'],
          },
        ]);
        return;
      }
    } finally {
      abortRef.current = null;
      setThinking(false);
      setStreaming(false);
      if (raw) finalise(replyId, raw);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function onChip(chip: ChipId) {
    if (chip === 'trial') { setPanel('signup'); return; }
    if (chip === 'demo' || chip === 'human') { setPanel('lead'); return; }
    // pricing — a plain navigation; let the browser handle it.
    window.location.assign('/#pricing');
  }

  function onComposerKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter makes a new line — the convention everywhere.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask(draft);
    }
  }

  // Chips and suggestions belong to the newest bot message only: older ones are a
  // record of the conversation, not live controls, and repeating them clutters
  // a small window.
  const lastBotId = [...msgs].reverse().find((m) => m.from === 'bot')?.id ?? -1;

  return (
    <div className="rovora-chat" data-open={open}>
      {open && (
        <div className="chat-panel" role="dialog" aria-label="Rovora assistant">
          <div className="chat-head">
            <div className="chat-head-id">
              <span className="chat-ava" aria-hidden>
                <span className="chat-ava-dot" />
              </span>
              <div className="chat-head-txt">
                <strong>Rovora assistant</strong>
                <span className="chat-status"><i /> {busy ? 'Typing…' : 'Online · replies instantly'}</span>
              </div>
            </div>
            <div className="chat-head-actions">
              {/* Only offer this once there's an actual conversation to clear. */}
              {msgs.length > 1 && (
                <button className="chat-x" onClick={startOver} aria-label="Start a new chat" title="Start a new chat">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                </button>
              )}
              <button className="chat-x" onClick={() => setOpen(false)} aria-label="Close chat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          </div>

          <div
            className="chat-body"
            ref={bodyRef}
            onScroll={onBodyScroll}
            aria-live="polite"
            aria-busy={busy}
          >
            {msgs.map((m) => (
              <div className={`chat-turn ${m.from}`} key={m.id}>
                {m.from === 'bot' ? (
                  <div className="chat-md chat-text">
                    {renderMarkdown(m.streaming ? visibleWhileStreaming(m.text) : m.text)}
                    {m.streaming && <span className="chat-caret" aria-hidden />}
                  </div>
                ) : (
                  <div className="chat-pill">{m.text}</div>
                )}

                {m.id === lastBotId && !busy && !panel && (
                  <>
                    {!!m.chips?.length && (
                      <div className="chat-chips">
                        {m.chips
                          .filter((c) => !(signedUp && c === 'trial'))
                          .map((c) => (
                            <button
                              key={c}
                              type="button"
                              className={`chat-chip ${c === 'trial' || c === 'demo' ? 'primary' : ''}`}
                              onClick={() => onChip(c)}
                            >
                              <ChipIcon chip={c} />
                              {CHIP_LABEL[c]}
                            </button>
                          ))}
                      </div>
                    )}
                    {!!m.asks?.length && (
                      <div className="chat-asks">
                        {m.asks.map((a) => (
                          <button key={a} type="button" className="chat-ask" onClick={() => ask(a)}>
                            {a}
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M5 12h14M13 6l6 6-6 6" />
                            </svg>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}

            {thinking && (
              <div className="chat-turn bot">
                <div className="chat-typing" aria-label="Assistant is typing">
                  <span /><span /><span />
                </div>
              </div>
            )}

            {panel === 'signup' && (
              <SignupPanel
                onClose={() => setPanel(null)}
                onDone={() => {
                  setSignedUp(true);
                  setPanel(null);
                  pushBot("You're all set — taking you into Rovora now. 🎉");
                }}
              />
            )}

            {panel === 'lead' && (
              <LeadPanel
                page={pathname}
                transcript={transcriptOf(msgs)}
                onClose={() => setPanel(null)}
                onDone={(name) => {
                  setPanel(null);
                  pushBot(
                    `Thanks ${name || 'for that'} — that's with our team now, and they usually come back within a few hours on business days. Anything else I can help with in the meantime?`,
                  );
                }}
              />
            )}
          </div>

          <form className="chat-input" onSubmit={(e: FormEvent) => { e.preventDefault(); ask(draft); }}>
            <div className="chat-composer">
              <textarea
                ref={taRef}
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onComposerKey}
                placeholder="Ask about pricing, features, setup…"
                aria-label="Message"
              />
              {busy ? (
                <button type="button" className="chat-send stop" onClick={stop} aria-label="Stop generating">
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <rect x="7" y="7" width="10" height="10" rx="2" />
                  </svg>
                </button>
              ) : (
                <button type="submit" className="chat-send" aria-label="Send" disabled={!draft.trim()}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
              )}
            </div>
            <p className="chat-legal">AI assistant · check anything important with our team</p>
          </form>
        </div>
      )}

      {/* Proactive teaser — a nudge, not a takeover. */}
      {!open && nudge && (
        <div className="chat-nudge">
          <button className="chat-nudge-x" onClick={() => setNudge(false)} aria-label="Dismiss">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
          <button className="chat-nudge-body" onClick={openChat}>
            <strong>Not sure which plan fits?</strong>
            <span>Tell me your fleet size and I&rsquo;ll work out the exact monthly cost.</span>
          </button>
        </div>
      )}

      <button
        className="chat-launch"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-label={open ? 'Close support chat' : 'Open support chat'}
      >
        <span className="chat-launch-ico" data-hide={open}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z" />
          </svg>
        </span>
        <span className="chat-launch-ico" data-hide={!open}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </span>
      </button>
    </div>
  );
}

// ── Chip icon ────────────────────────────────────────────────────────────────

function ChipIcon({ chip }: { chip: ChipId }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (chip === 'trial') return <svg {...common}><path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" /></svg>;
  if (chip === 'demo') return <svg {...common}><path d="M8 2v3M16 2v3M3.5 9h17" /><rect x="3.5" y="5" width="17" height="16" rx="2" /></svg>;
  if (chip === 'human') return <svg {...common}><path d="M4 4h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8l-4 3V5a1 1 0 0 1 1-1Z" /><circle cx="12" cy="11" r="2" /></svg>;
  return <svg {...common}><path d="M12 2v20M17 6.5c0-1.9-2.2-2.9-5-2.9s-5 1-5 3 2.2 2.6 5 3.1 5 1.2 5 3.2-2.2 3-5 3-5-1-5-3" /></svg>;
}

// ── In-chat trial sign-up ────────────────────────────────────────────────────
// The whole point: a visitor who says yes never has to go and find the sign-up
// page. Email + password, a code, and they land in onboarding — same flow the
// /login page runs, just without the detour.

function SignupPanel({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<'details' | 'code'>('details');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [verifyType, setVerifyType] = useState<SignupVerifyType>('signup');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Hand over to onboarding once the session cookie exists. A hard navigation so
  // the server re-runs with the new session rather than serving the cached page.
  function enterApp() {
    onDone();
    window.location.assign('/onboarding');
  }

  async function submitDetails(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const res = await chatSignupAction(email, password);
      if (res.error) { setErr(res.error); return; }
      if (res.status === 'signed_in') { enterApp(); return; }
      setVerifyType(res.verifyType ?? 'signup');
      setNote(`We've emailed a 6-digit code to ${email}.`);
      setStep('code');
      setCooldown(60);
    } catch {
      setErr('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const res = await chatVerifyCodeAction(email, code, verifyType);
      if (!res.ok) { setErr(res.error || 'Could not verify that code.'); return; }
      enterApp();
    } catch {
      setErr('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (cooldown > 0 || busy) return;
    setErr('');
    setBusy(true);
    try {
      const res = await resendSignupCodeAction(email);
      if (!res.ok) { setErr(res.error || 'Could not send a new code.'); return; }
      setVerifyType(res.verifyType ?? 'email');
      setNote(`A fresh code is on its way to ${email}.`);
      setCooldown(60);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat-form">
      <div className="chat-form-head">
        <strong>{step === 'details' ? `Start your ${TRIAL_DAYS}-day free trial` : 'Check your email'}</strong>
        <button type="button" className="chat-x" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>

      {err && <div className="chat-form-err">{err}</div>}
      {note && !err && <div className="chat-form-note">{note}</div>}

      {step === 'details' ? (
        <form onSubmit={submitDetails}>
          <label className="chat-form-lbl" htmlFor="chat-su-email">Work email</label>
          <input
            id="chat-su-email"
            className="chat-form-in"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourfleet.com"
            autoComplete="email"
            required
          />
          <label className="chat-form-lbl" htmlFor="chat-su-pw">Choose a password</label>
          <input
            id="chat-su-pw"
            className="chat-form-in"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            autoComplete="new-password"
            minLength={6}
            required
          />
          <button type="submit" className="chat-form-btn" disabled={busy || !email || password.length < 6}>
            {busy ? 'Creating your account…' : 'Create my account'}
          </button>
          <p className="chat-form-fine">
            {TRIAL_DAYS} days free · no card required · cancel any time. By continuing you agree to our{' '}
            <a href="/terms">terms</a> and <a href="/privacy">privacy policy</a>.
          </p>
        </form>
      ) : (
        <form onSubmit={submitCode}>
          <label className="chat-form-lbl" htmlFor="chat-su-code">Verification code</label>
          <input
            id="chat-su-code"
            className="chat-form-in chat-form-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="······"
            autoFocus
            required
          />
          <button type="submit" className="chat-form-btn" disabled={busy || code.length < 6}>
            {busy ? 'Verifying…' : 'Verify & get started'}
          </button>
          <p className="chat-form-fine">
            {cooldown > 0 ? (
              <>Didn&rsquo;t get it? Resend in {cooldown}s</>
            ) : (
              <>
                Didn&rsquo;t get it?{' '}
                <button type="button" className="chat-form-link" onClick={resend}>Send a new code</button>
              </>
            )}
          </p>
        </form>
      )}
    </div>
  );
}

// ── In-chat lead capture ─────────────────────────────────────────────────────
// This replaced a mailto: link, which silently lost every visitor whose browser
// had no mail client configured — and left no record of the ones it didn't. The
// lead now lands in the admin Inquiries inbox with the conversation attached.

function LeadPanel({
  page,
  transcript,
  onClose,
  onDone,
}: {
  page: string;
  transcript: string;
  onClose: () => void;
  onDone: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [fleetSize, setFleetSize] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const res = await submitChatLeadAction({ name, email, phone, fleetSize, message, transcript, page, topic: 'sales' });
      if (res?.error) { setErr(res.error); return; }
      onDone(name.split(' ')[0] || '');
    } catch {
      setErr('Something went wrong. Please try again, or email ' + SALES_EMAIL + '.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat-form">
      <div className="chat-form-head">
        <strong>Talk to the team</strong>
        <button type="button" className="chat-x" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>

      {err && <div className="chat-form-err">{err}</div>}

      <form onSubmit={submit}>
        <label className="chat-form-lbl" htmlFor="chat-ld-name">Your name</label>
        <input id="chat-ld-name" className="chat-form-in" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Murphy" autoComplete="name" maxLength={120} required />

        <label className="chat-form-lbl" htmlFor="chat-ld-email">Email</label>
        <input id="chat-ld-email" className="chat-form-in" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alex@yourfleet.com" autoComplete="email" maxLength={200} required />

        <div className="chat-form-row">
          <div>
            <label className="chat-form-lbl" htmlFor="chat-ld-phone">Phone <span>· optional</span></label>
            <input id="chat-ld-phone" className="chat-form-in" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+353 …" autoComplete="tel" maxLength={40} />
          </div>
          <div>
            <label className="chat-form-lbl" htmlFor="chat-ld-size">Fleet size</label>
            <select id="chat-ld-size" className="chat-form-in" value={fleetSize} onChange={(e) => setFleetSize(e.target.value)}>
              <option value="">Select…</option>
              {FLEET_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <label className="chat-form-lbl" htmlFor="chat-ld-msg">Anything to add? <span>· optional</span></label>
        <textarea id="chat-ld-msg" className="chat-form-in chat-form-ta" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What you'd like to see, best time to call…" maxLength={2000} />

        <button type="submit" className="chat-form-btn" disabled={busy || !name.trim() || !email.trim()}>
          {busy ? 'Sending…' : 'Send to the team'}
        </button>
        <p className="chat-form-fine">
          We&rsquo;ll send your chat along so you don&rsquo;t repeat yourself. Prefer email?{' '}
          <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>
        </p>
      </form>
    </div>
  );
}
