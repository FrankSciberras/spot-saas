'use client';

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import FleetIcon from '@/components/fleet/FleetIcon';
import { MAX_ATTACHMENT_BYTES, MAX_MESSAGE_LENGTH, type ChatConversation, type ChatMember, type ChatMessage, type ChatPerson } from '@/lib/messages/types';
import ChatAvatar from './ChatAvatar';
import { clockTime, dayLabel, fileSize, linkify, roleLabel, sameDay } from './format';
import { useMediaQuery } from './hooks';
import styles from './messages.module.css';

/** A message as the screen holds it — server copy, or our own still sending. */
export interface UIMessage extends ChatMessage {
  status?: 'sending' | 'failed';
  error?: string;
  localFile?: File;
}

const RUN_GAP_MS = 5 * 60_000;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt';

export default function ThreadView({
  conversation,
  messages,
  members,
  people,
  meId,
  isManager,
  isMobile,
  loading,
  hasMore,
  loadingOlder,
  error,
  onBack,
  onOpenInfo,
  onSend,
  onRetry,
  onDelete,
  onLoadOlder,
  onViewImage,
}: {
  conversation: ChatConversation;
  messages: UIMessage[];
  members: ChatMember[];
  people: Record<string, ChatPerson>;
  meId: string;
  isManager: boolean;
  isMobile: boolean;
  loading: boolean;
  hasMore: boolean;
  loadingOlder: boolean;
  error: string | null;
  onBack: () => void;
  onOpenInfo: () => void;
  onSend: (text: string, file: File | null) => void;
  onRetry: (m: UIMessage) => void;
  onDelete: (m: UIMessage) => void;
  onLoadOlder: () => void;
  onViewImage: (src: string, downloadHref: string | null) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const [showNewPill, setShowNewPill] = useState(false);
  // Touch screens: the tapped message shows its actions (see .msgRowActive).
  const [activeId, setActiveId] = useState<string | null>(null);
  const firstIdRef = useRef<string | null>(null);
  const lastIdRef = useRef<string | null>(null);
  const prependRef = useRef<{ height: number; top: number } | null>(null);
  const stuckRef = useRef(true);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // (MessagesApp keys this component by chat id, so opening another chat
  // starts fresh — scrolled to the bottom, no stale "New messages" pill.)

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    setShowNewPill(false);
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !messages.length) return;
    const first = messages[0].id;
    const last = messages[messages.length - 1];

    if (prependRef.current && firstIdRef.current && first !== firstIdRef.current) {
      // Older page loaded on top — keep what the reader was looking at in place.
      el.scrollTop = el.scrollHeight - prependRef.current.height + prependRef.current.top;
      prependRef.current = null;
    } else if (last.id !== lastIdRef.current) {
      const initial = lastIdRef.current === null;
      if (initial || stuckRef.current || last.senderId === meId) scrollToBottom(!initial);
      else setShowNewPill(true);
    }
    firstIdRef.current = first;
    lastIdRef.current = last.id;
  }, [messages, meId, scrollToBottom]);

  // Photos and fonts finish loading after the jump to the bottom and push the
  // newest message out of view. While the reader is at the bottom, stay there.
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (stuckRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stuckRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (stuckRef.current) setShowNewPill(false);
  };

  const loadOlder = () => {
    const el = scrollRef.current;
    if (el) prependRef.current = { height: el.scrollHeight, top: el.scrollTop };
    onLoadOlder();
  };

  // ---- Seen ---------------------------------------------------------------
  const seenLabel = useMemo(() => {
    const mine = [...messages].reverse().find((m) => m.senderId === meId && !m.status && !m.deletedAt && m.kind !== 'system');
    if (!mine) return null;
    const others = members.filter((m) => m.userId !== meId);
    const seen = others.filter((m) => m.lastReadAt >= mine.createdAt).length;
    let label: string;
    if (conversation.kind === 'direct') label = seen > 0 ? 'Seen' : 'Sent';
    else if (seen === 0) label = 'Sent';
    else if (seen === others.length) label = 'Seen by everyone';
    else label = `Seen by ${seen}`;
    return { id: mine.id, label };
  }, [messages, members, meId, conversation.kind]);

  const nameOf = (id: string | null) => (id ? people[id]?.name ?? 'Former member' : 'Rovora');

  const subtitle =
    conversation.kind === 'direct'
      ? conversation.other
        ? conversation.other.inFleet
          ? roleLabel(conversation.other.role, conversation.other.isManager)
          : 'No longer in your fleet'
        : ''
      : `${conversation.memberCount} ${conversation.memberCount === 1 ? 'member' : 'members'}${conversation.announcement ? ' · announcements' : ''}`;

  return (
    <section className={styles.thread} aria-label={`Chat: ${conversation.title}`}>
      <header className={styles.threadHead}>
        {isMobile && (
          <button type="button" className={`${styles.iconBtn} ${styles.iconBtnBare}`} onClick={onBack} aria-label="Back to chats">
            <FleetIcon name="chevron-left" size={20} stroke={2} />
          </button>
        )}
        <button type="button" className={styles.threadHeadMain} onClick={onOpenInfo} aria-label="Chat info">
          {conversation.kind === 'group' ? (
            <ChatAvatar size={38} group={{ id: conversation.id, isEveryone: conversation.isEveryone, announcement: conversation.announcement }} />
          ) : (
            <ChatAvatar size={38} person={conversation.other} />
          )}
          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span className={styles.threadTitle}>{conversation.title}</span>
            <span className={styles.threadSub}>{subtitle}</span>
          </span>
        </button>
        <button type="button" className={`${styles.iconBtn} ${styles.iconBtnBare}`} onClick={onOpenInfo} aria-label="Chat info" title="Chat info">
          <FleetIcon name="info" size={18} />
        </button>
      </header>

      <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div ref={scrollRef} className={styles.scroller} onScroll={onScroll} role="log" aria-live="polite">
          <div ref={contentRef} className={styles.scrollerInner}>
          {hasMore && (
            <button type="button" className={`${styles.ghostBtn} ${styles.olderBtn}`} onClick={loadOlder} disabled={loadingOlder}>
              {loadingOlder ? 'Loading…' : 'Load earlier messages'}
            </button>
          )}
          {loading && !messages.length && <div className={styles.placeholder}>Loading messages…</div>}
          {error && !messages.length && <div className={styles.placeholder}>{error}</div>}
          {!loading && !error && messages.length === 0 && (
            <div className={styles.placeholder}>
              <p>No messages yet. Say hello 👋</p>
            </div>
          )}

          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || !sameDay(prev.createdAt, m.createdAt);
            const dayChip = newDay ? <div className={styles.dayChip}>{dayLabel(m.createdAt, now)}</div> : null;

            if (m.kind === 'system') {
              return (
                <Fragment key={m.id}>
                  {dayChip}
                  <div className={styles.system}>{m.body}</div>
                </Fragment>
              );
            }

            const mine = m.senderId === meId;
            const startsRun =
              newDay ||
              !prev ||
              prev.kind === 'system' ||
              prev.senderId !== m.senderId ||
              Date.parse(m.createdAt) - Date.parse(prev.createdAt) > RUN_GAP_MS;
            const showSender = conversation.kind === 'group' && !mine && startsRun;
            const canDelete = !m.deletedAt && !m.status && (mine || (conversation.kind === 'group' && isManager));
            const sender = m.senderId ? people[m.senderId] : null;

            return (
              <Fragment key={m.clientId && mine ? `c-${m.clientId}` : m.id}>
                {dayChip}
                <div
                  className={`${styles.msgRow} ${mine ? styles.msgRowMine : ''} ${startsRun && !newDay ? styles.msgRowGap : ''} ${activeId === m.id ? styles.msgRowActive : ''}`}
                  style={{ alignItems: 'flex-start' }}
                  onClick={canDelete ? () => setActiveId((a) => (a === m.id ? null : m.id)) : undefined}
                >
                  {conversation.kind === 'group' && !mine && (
                    <span className={styles.avatarSlot}>
                      {startsRun && <ChatAvatar size={28} person={sender ?? { userId: m.senderId ?? 'x', name: nameOf(m.senderId), avatarUrl: null }} />}
                    </span>
                  )}
                  {mine && canDelete && (
                    <span className={styles.msgActions}>
                      <button type="button" className={`${styles.iconBtn} ${styles.iconBtnBare}`} style={{ width: 28, height: 28 }} title="Delete for everyone" aria-label="Delete message" onClick={() => onDelete(m)}>
                        <FleetIcon name="trash" size={14} />
                      </button>
                    </span>
                  )}
                  <div className={styles.bubbleWrap}>
                    {showSender && <span className={styles.senderName}>{nameOf(m.senderId)}</span>}
                    <div
                      className={[
                        styles.bubble,
                        mine ? styles.bubbleMine : '',
                        m.deletedAt ? styles.bubbleDeleted : '',
                        m.status === 'failed' ? styles.bubbleFailed : '',
                      ].join(' ')}
                    >
                      {m.deletedAt ? (
                        'This message was deleted'
                      ) : (
                        <>
                          {m.attachment && m.kind === 'image' && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              className={styles.photo}
                              src={m.attachment.url}
                              alt={m.attachment.name}
                              loading="lazy"
                              onClick={(e) => {
                                e.stopPropagation();
                                onViewImage(m.attachment!.url, m.status ? null : `${m.attachment!.url}?download=1`);
                              }}
                            />
                          )}
                          {m.attachment && m.kind === 'file' && (
                            <a className={styles.fileChip} href={m.status ? undefined : `${m.attachment.url}?download=1`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                              <FleetIcon name="doc" size={20} />
                              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                <span className={styles.fileChipName}>{m.attachment.name}</span>
                                <span className={styles.fileChipSize}>{fileSize(m.attachment.size)}</span>
                              </span>
                              <FleetIcon name="download" size={16} style={{ marginLeft: 'auto', color: 'var(--text-3)' }} />
                            </a>
                          )}
                          {m.body &&
                            linkify(m.body).map((part, idx) =>
                              part.href ? (
                                <a key={idx} href={part.href} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()}>{part.text}</a>
                              ) : (
                                <Fragment key={idx}>{part.text}</Fragment>
                              ),
                            )}
                        </>
                      )}
                      <div className={styles.meta}>
                        {m.status === 'sending' && <span>Sending…</span>}
                        {m.status === 'failed' && (
                          <>
                            <span style={{ color: 'var(--neg)' }}>{m.error || 'Not sent'}</span>
                            <button type="button" className={styles.retry} onClick={() => onRetry(m)}>Retry</button>
                          </>
                        )}
                        {!m.status && <span>{clockTime(m.createdAt)}</span>}
                      </div>
                    </div>
                    {seenLabel?.id === m.id && <span className={styles.seen}>{seenLabel.label}</span>}
                  </div>
                  {!mine && canDelete && (
                    <span className={styles.msgActions}>
                      <button type="button" className={`${styles.iconBtn} ${styles.iconBtnBare}`} style={{ width: 28, height: 28 }} title="Delete for everyone" aria-label="Delete message" onClick={() => onDelete(m)}>
                        <FleetIcon name="trash" size={14} />
                      </button>
                    </span>
                  )}
                </div>
              </Fragment>
            );
          })}
          </div>
        </div>
        {showNewPill && (
          <button type="button" className={styles.newPill} onClick={() => scrollToBottom(true)}>
            New messages ↓
          </button>
        )}
      </div>

      {conversation.canPost ? (
        <Composer key={conversation.id} isMobile={isMobile} onSend={onSend} />
      ) : (
        <div className={styles.readOnly}>
          <FleetIcon name={conversation.kind === 'group' ? 'megaphone' : 'lock'} size={15} />
          {conversation.kind === 'group'
            ? 'Only managers can post in this group.'
            : 'This person is no longer in your fleet, so you can’t reply.'}
        </div>
      )}
    </section>
  );
}

function Composer({ isMobile, onSend }: { isMobile: boolean; onSend: (text: string, file: File | null) => void }) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Touch screens: Enter makes a new line; the send button sends.
  const coarse = useMediaQuery('(pointer: coarse)');

  // Desktop: put the cursor straight in the box when a chat opens.
  useEffect(() => {
    if (!isMobile) areaRef.current?.focus();
  }, [isMobile]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const autosize = () => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  const pick = (f: File | null) => {
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (!f) { setFile(null); return; }
    if (f.size > MAX_ATTACHMENT_BYTES) { setError('That file is over 15 MB.'); setFile(null); return; }
    setFile(f);
    if (/^image\/(jpeg|png|webp|gif)$/.test(f.type)) setPreview(URL.createObjectURL(f));
  };

  const submit = () => {
    const t = text.trim();
    if (!t && !file) return;
    if (t.length > MAX_MESSAGE_LENGTH) { setError(`Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`); return; }
    onSend(t, file);
    setText('');
    setFile(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
    requestAnimationFrame(() => {
      autosize();
      if (!coarse) areaRef.current?.focus();
    });
  };

  return (
    <div className={styles.composer}>
      {error && <p className={styles.composerError}>{error}</p>}
      {file && (
        <div className={styles.pendingFile}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview ? <img src={preview} alt="" /> : <FleetIcon name="doc" size={22} />}
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.name} · {fileSize(file.size)}
          </span>
          <button type="button" className={`${styles.iconBtn} ${styles.iconBtnBare}`} onClick={() => pick(null)} aria-label="Remove attachment">
            <FleetIcon name="close" size={15} />
          </button>
        </div>
      )}
      <div className={styles.composerRow}>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
        <button type="button" className={`${styles.iconBtn} ${styles.iconBtnBare}`} style={{ width: 38, height: 38 }} onClick={() => fileRef.current?.click()} aria-label="Attach a photo or file" title="Photo or file">
          <FleetIcon name="paperclip" size={19} />
        </button>
        <textarea
          ref={areaRef}
          className={styles.textarea}
          rows={1}
          value={text}
          placeholder={file ? 'Add a caption (optional)' : 'Message'}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(e) => { setText(e.target.value); autosize(); }}
          onKeyDown={(e) => {
            // Desktop: Enter sends, Shift+Enter new line. Phones: the keyboard's
            // Enter is a new line and the send button sends.
            if (e.key === 'Enter' && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          aria-label="Message"
        />
        <button type="button" className={styles.sendBtn} onClick={submit} disabled={!text.trim() && !file} aria-label="Send">
          <FleetIcon name="send" size={17} stroke={1.9} />
        </button>
      </div>
    </div>
  );
}
