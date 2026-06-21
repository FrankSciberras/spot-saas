'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

type Msg = { id: number; from: 'bot' | 'user'; text: string };

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

const SALES_EMAIL = 'hello@rovora.eu';

const GREETING: Msg = {
  id: 0,
  from: 'bot',
  text: "Hi! 👋 I'm Rovora's assistant. Ask me anything about features, pricing, which plan fits your fleet or getting set up — or, any time, press “Talk to a real person” to reach our team.",
};

// Subject + body the "Talk to a real person" button pre-fills. We append a short
// transcript so whoever picks up the email has the visitor's context.
function humanMailto(msgs: Msg[]): string {
  const recent = msgs
    .slice(-8)
    .map((m) => `${m.from === 'user' ? 'Me' : 'Rovora assistant'}: ${m.text}`)
    .join('\n\n');
  const body =
    `Hi Rovora team,\n\nI'd like to talk to a real person about:\n\n\n` +
    (recent ? `---\nMy chat so far:\n\n${recent}\n` : '');
  return `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(
    'Chat with the Rovora team',
  )}&body=${encodeURIComponent(body)}`;
}

export default function RovoraSupportChat() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const nextId = useRef(1);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the transcript pinned to the newest message.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, typing]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || typing) return;

    const userMsg: Msg = { id: nextId.current++, from: 'user', text };
    const history = [...msgs, userMsg];
    setMsgs(history);
    setDraft('');
    setTyping(true);

    try {
      const res = await fetch('/api/support-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          // Send the conversation (minus the opening greeting) as the model history.
          messages: history
            .filter((m) => m.id !== 0)
            .map((m) => ({ role: m.from === 'user' ? 'user' : 'assistant', content: m.text })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      const reply: string =
        (data && typeof data.reply === 'string' && data.reply.trim()) ||
        `Sorry, something went wrong on my end. Press “Talk to a real person” below and our team will help you out.`;
      setMsgs((m) => [...m, { id: nextId.current++, from: 'bot', text: reply }]);
    } catch {
      setMsgs((m) => [
        ...m,
        {
          id: nextId.current++,
          from: 'bot',
          text: `I couldn't reach our assistant just now. Press “Talk to a real person” below to email us and we'll get right back to you.`,
        },
      ]);
    } finally {
      setTyping(false);
    }
  }

  const mailto = humanMailto(msgs);

  return (
    <div className="rovora-chat" data-open={open}>
      {open && (
        <div className="chat-panel" role="dialog" aria-label="Support chat">
          <div className="chat-head">
            <div className="chat-head-id">
              <span className="chat-ava" aria-hidden>
                <span className="chat-ava-dot" />
              </span>
              <div className="chat-head-txt">
                <strong>Rovora assistant</strong>
                <span className="chat-status"><i /> Ask anything · or reach a human</span>
              </div>
            </div>
            <button className="chat-x" onClick={() => setOpen(false)} aria-label="Close chat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <div className="chat-body" ref={bodyRef}>
            {msgs.map((m) => (
              <div key={m.id}>
                <div className={`chat-msg ${m.from}`}>
                  <div className="chat-bubble">
                    {m.from === 'bot' ? <div className="chat-md">{renderMarkdown(m.text)}</div> : m.text}
                  </div>
                </div>
                {/* After every bot message, offer a one-press route to a human. */}
                {m.from === 'bot' && (
                  <a className="chat-human" href={mailto}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8l-4 3V5a1 1 0 0 1 1-1Z" />
                      <circle cx="12" cy="11" r="2" />
                    </svg>
                    Talk to a real person
                  </a>
                )}
              </div>
            ))}
            {typing && (
              <div className="chat-msg bot">
                <div className="chat-bubble chat-typing" aria-label="Assistant is typing">
                  <span /><span /><span />
                </div>
              </div>
            )}
          </div>

          <form className="chat-input" onSubmit={send}>
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a message…"
              aria-label="Message"
            />
            <button type="submit" className="chat-send" aria-label="Send" disabled={!draft.trim() || typing}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />
              </svg>
            </button>
          </form>
        </div>
      )}

      <button
        className="chat-launch"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Close support chat' : 'Open support chat'}
      >
        {open ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z" />
          </svg>
        )}
      </button>
    </div>
  );
}
