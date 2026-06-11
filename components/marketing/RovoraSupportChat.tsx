'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

type Msg = { id: number; from: 'bot' | 'user'; text: string };

const GREETING: Msg = {
  id: 0,
  from: 'bot',
  text: "Hi! 👋 I'm Rovora's assistant. Ask me anything about features, pricing or getting set up — or tell me what your fleet needs.",
};

// This is a lightweight contact form, not a live agent. Be honest: a human
// follows up by email rather than replying in the widget.
const STUB_REPLY =
  "Thanks for that! This chat isn't staffed live — drop your email here or write to hello@rovora.eu and a real person will get back to you. In the meantime you're welcome to start a free trial.";

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

  function send(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const userMsg: Msg = { id: nextId.current++, from: 'user', text };
    setMsgs((m) => [...m, userMsg]);
    setDraft('');
    setTyping(true);
    // Simulated assistant response — swap for a real API call later.
    window.setTimeout(() => {
      setTyping(false);
      setMsgs((m) => [...m, { id: nextId.current++, from: 'bot', text: STUB_REPLY }]);
    }, 900);
  }

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
                <strong>Rovora support</strong>
                <span className="chat-status"><i /> We&apos;ll follow up by email</span>
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
              <div key={m.id} className={`chat-msg ${m.from}`}>
                <div className="chat-bubble">{m.text}</div>
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
            <button type="submit" className="chat-send" aria-label="Send" disabled={!draft.trim()}>
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
