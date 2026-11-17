'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import FleetIcon from '@/components/fleet/FleetIcon';
import { createClient } from '@/lib/supabase/client';
import {
  mapMessageRow,
  type ChatConversation,
  type ChatInboxResponse,
  type ChatMember,
  type ChatMessage,
  type ChatMessagesResponse,
  type ChatPerson,
  type ChatThreadResponse,
  type MessageRow,
} from '@/lib/messages/types';
import ChatInfoPanel, { type InfoActions } from './ChatInfoPanel';
import ChatModal from './ChatModal';
import ConversationList from './ConversationList';
import NewChatDialog from './NewChatDialog';
import ThreadView, { type UIMessage } from './ThreadView';
import { newClientId } from './format';
import { useIsClient, useMediaQuery } from './hooks';
import { refreshUnreadMessages } from './useUnreadMessages';
import styles from './messages.module.css';

/**
 * The whole chat screen (shared by /fleet/messages and /driver/messages).
 *
 *   * inbox + open thread come from /api/messages/*
 *   * new messages, deletions and read positions arrive live over Supabase
 *     Realtime (the DB only lets each person receive their own chats' rows)
 *   * if Realtime can't connect, it quietly falls back to checking every few
 *     seconds, and always re-checks when the window comes back into view
 *   * sends are optimistic: the bubble appears at once, then is swapped for
 *     the server's copy (matched by clientId, so it never shows twice)
 */

interface ThreadState {
  id: string;
  conversation: ChatConversation | null;
  members: ChatMember[];
  messages: UIMessage[];
  hasMore: boolean;
  loading: boolean;
  loadingOlder: boolean;
  error: string | null;
}

interface InboxError {
  message: string;
  disabled?: boolean;
  needsMigration?: boolean;
}

const POLL_MS = 7_000;

function previewOf(m: ChatMessage): string {
  if (m.kind === 'image') return m.body?.trim() || 'Photo';
  if (m.kind === 'file') return m.body?.trim() || m.attachment?.name || 'File';
  return (m.body ?? '').slice(0, 140);
}

/** Pending (still sending) bubbles always sit at the bottom, in the order sent. */
function sortMessages(list: UIMessage[]): UIMessage[] {
  return list.sort((a, b) => Number(!!a.status) - Number(!!b.status) || a.createdAt.localeCompare(b.createdAt));
}

/** Insert or replace by id — or by clientId, which swaps our pending bubble for the server copy. */
function upsertMessage(list: UIMessage[], msg: UIMessage): UIMessage[] {
  const idx = list.findIndex(
    (m) => m.id === msg.id || (!!msg.clientId && m.clientId === msg.clientId && m.senderId === msg.senderId),
  );
  if (idx >= 0) {
    const copy = list.slice();
    copy[idx] = msg;
    // A server copy could also have matched a second entry (realtime + POST reply).
    return sortMessages(copy.filter((m, i) => i === idx || !(m.id === msg.id)));
  }
  return sortMessages([...list, msg]);
}

function mergeMessages(list: UIMessage[], incoming: UIMessage[]): UIMessage[] {
  return incoming.reduce(upsertMessage, list.slice());
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function blankThread(id: string, conversation: ChatConversation | null): ThreadState {
  return { id, conversation, members: [], messages: [], hasMore: false, loading: true, loadingOlder: false, error: null };
}

export default function MessagesApp({
  userId,
  organizationId,
  variant,
  initialConversationId,
}: {
  userId: string;
  organizationId: string;
  variant: 'fleet' | 'driver';
  initialConversationId?: string | null;
}) {
  const basePath = variant === 'driver' ? '/driver/messages' : '/fleet/messages';

  const [inbox, setInbox] = useState<ChatInboxResponse | null>(null);
  const [inboxError, setInboxError] = useState<InboxError | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId ?? null);
  const [thread, setThread] = useState<ThreadState | null>(() =>
    initialConversationId ? blankThread(initialConversationId, null) : null,
  );
  const [people, setPeople] = useState<Record<string, ChatPerson>>({});
  const [dialog, setDialog] = useState<null | 'new' | 'info' | 'settings'>(null);
  const [lightbox, setLightbox] = useState<{ src: string; download: string | null } | null>(null);
  const [live, setLive] = useState<boolean | null>(null);
  const isMobile = useMediaQuery('(max-width: 720px)');
  const mounted = useIsClient();
  const [rootTop, setRootTop] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // Latest values for the long-lived Realtime callbacks.
  const selectedRef = useRef(selectedId);
  const inboxRef = useRef(inbox);
  const peopleRef = useRef(people);
  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);
  useEffect(() => { inboxRef.current = inbox; }, [inbox]);
  useEffect(() => { peopleRef.current = people; }, [people]);

  // ---- Layout: fill the space between the top bar and the bottom tabs -------
  useLayoutEffect(() => {
    const measure = () => {
      const el = rootRef.current;
      if (el) setRootTop(el.getBoundingClientRect().top + window.scrollY);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [inboxError, isMobile]);

  const mergePeople = useCallback((list: ChatPerson[]) => {
    if (!list.length) return;
    setPeople((prev) => {
      const next = { ...prev };
      for (const p of list) next[p.userId] = p;
      return next;
    });
  }, []);

  // ---- Inbox --------------------------------------------------------------
  const loadInbox = useCallback(async (): Promise<ChatInboxResponse | null> => {
    try {
      const res = await fetch('/api/messages/inbox', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInboxError({ message: data.error || 'Could not load your messages.', disabled: data.disabled, needsMigration: data.needsMigration });
        return null;
      }
      const body = data as ChatInboxResponse;
      setInboxError(null);
      setInbox(body);
      mergePeople(body.conversations.flatMap((c) => (c.other ? [c.other] : [])));
      return body;
    } catch {
      if (!inboxRef.current) setInboxError({ message: 'You seem to be offline. Messages will load when you’re back online.' });
      return null;
    }
  }, [mergePeople]);

  // First load. (Through .then so every state update happens in the fetch's
  // callback, never synchronously inside the effect.)
  useEffect(() => { void Promise.resolve().then(loadInbox); }, [loadInbox]);

  const patchInboxRow = useCallback((id: string, patch: (c: ChatConversation) => ChatConversation, toTop = false) => {
    setInbox((prev) => {
      if (!prev) return prev;
      const idx = prev.conversations.findIndex((c) => c.id === id);
      if (idx < 0) return prev;
      const updated = patch(prev.conversations[idx]);
      const rest = prev.conversations.filter((_, i) => i !== idx);
      const conversations = toTop ? [updated, ...rest] : prev.conversations.map((c, i) => (i === idx ? updated : c));
      return { ...prev, conversations };
    });
  }, []);

  // ---- Read receipts ------------------------------------------------------
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markRead = useCallback((id: string) => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (readTimer.current) clearTimeout(readTimer.current);
    readTimer.current = setTimeout(async () => {
      patchInboxRow(id, (c) => ({ ...c, unread: 0 }));
      try {
        await fetch(`/api/messages/conversations/${id}/read`, { method: 'POST' });
      } catch {
        /* next visit will catch up */
      }
      refreshUnreadMessages();
    }, 350);
  }, [patchInboxRow]);

  // ---- Thread -------------------------------------------------------------
  const loadThreadMeta = useCallback(async (id: string) => {
    const res = await fetch(`/api/messages/conversations/${id}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const meta = (await res.json()) as ChatThreadResponse;
    if (selectedRef.current !== id) return meta;
    mergePeople(meta.members);
    setThread((t) => (t && t.id === id ? { ...t, conversation: meta.conversation, members: meta.members } : t));
    patchInboxRow(id, (c) => ({ ...meta.conversation, unread: c.unread }));
    return meta;
  }, [mergePeople, patchInboxRow]);

  const fetchLatest = useCallback(async (id: string) => {
    const res = await fetch(`/api/messages/conversations/${id}/messages`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as ChatMessagesResponse;
    mergePeople(data.people);
    return data;
  }, [mergePeople]);

  // Load the open chat. openConversation() has already put a blank "loading"
  // thread in place; this fills it.
  useEffect(() => {
    if (!selectedId) return;
    const id = selectedId;
    const known = inboxRef.current?.conversations.find((c) => c.id === id) ?? null;
    let cancelled = false;
    (async () => {
      const [metaRes, msgs] = await Promise.all([
        fetch(`/api/messages/conversations/${id}`, { cache: 'no-store' }),
        fetchLatest(id),
      ]);
      if (cancelled) return;
      if (!metaRes.ok || !msgs) {
        const gone = metaRes.status === 404 || metaRes.status === 403;
        setThread((t) => (t && t.id === id ? { ...t, loading: false, error: gone ? 'This chat isn’t available any more.' : 'Could not load this chat. Check your connection.' } : t));
        return;
      }
      const meta = (await metaRes.json()) as ChatThreadResponse;
      mergePeople(meta.members);
      setThread((t) =>
        t && t.id === id
          ? { ...t, conversation: meta.conversation, members: meta.members, messages: mergeMessages(t.messages, msgs.messages), hasMore: msgs.hasMore, loading: false }
          : t,
      );
      if (meta.conversation.unread > 0 || (known?.unread ?? 0) > 0) markRead(id);
    })();
    return () => { cancelled = true; };
  }, [selectedId, fetchLatest, mergePeople, markRead]);

  const openConversation = useCallback((id: string | null) => {
    setDialog(null);
    if (id === selectedRef.current) return; // already open (the loader only runs on a change)
    setSelectedId(id);
    setThread(id ? blankThread(id, inboxRef.current?.conversations.find((c) => c.id === id) ?? null) : null);
    setDialog(null);
    window.history.replaceState(null, '', id ? `${basePath}?c=${id}` : basePath);
  }, [basePath]);

  const loadOlder = useCallback(async () => {
    const t = thread;
    if (!t || t.loadingOlder || !t.hasMore) return;
    const oldest = t.messages.find((m) => !m.status);
    if (!oldest) return;
    setThread((s) => (s && s.id === t.id ? { ...s, loadingOlder: true } : s));
    try {
      const res = await fetch(`/api/messages/conversations/${t.id}/messages?before=${encodeURIComponent(oldest.createdAt)}`, { cache: 'no-store' });
      const data = (await res.json()) as ChatMessagesResponse;
      mergePeople(data.people ?? []);
      setThread((s) => (s && s.id === t.id ? { ...s, messages: mergeMessages(s.messages, data.messages ?? []), hasMore: !!data.hasMore, loadingOlder: false } : s));
    } catch {
      setThread((s) => (s && s.id === t.id ? { ...s, loadingOlder: false } : s));
    }
  }, [thread, mergePeople]);

  // ---- Live updates -------------------------------------------------------
  const onMessageRow = useCallback((row: MessageRow, isInsert: boolean) => {
    const msg = mapMessageRow(row);
    const openId = selectedRef.current;
    const visible = document.visibilityState === 'visible';

    if (msg.conversationId === openId) {
      setThread((t) => (t && t.id === msg.conversationId ? { ...t, messages: upsertMessage(t.messages, msg) } : t));
      if (isInsert && msg.senderId !== userId) markRead(openId);
      if (msg.kind === 'system' || (msg.senderId && !peopleRef.current[msg.senderId])) void loadThreadMeta(openId);
    }

    const known = inboxRef.current?.conversations.some((c) => c.id === msg.conversationId);
    if (!known || msg.kind === 'system') {
      void loadInbox();
      return;
    }
    if (isInsert) {
      const counts = msg.senderId !== userId && !(msg.conversationId === openId && visible);
      patchInboxRow(
        msg.conversationId,
        (c) => ({
          ...c,
          lastMessageAt: msg.createdAt,
          lastMessagePreview: previewOf(msg),
          lastMessageSenderId: msg.senderId,
          lastMessageSenderName: msg.senderId ? peopleRef.current[msg.senderId]?.name ?? null : null,
          unread: counts ? c.unread + 1 : c.unread,
        }),
        true,
      );
      if (counts) refreshUnreadMessages();
    } else if (msg.deletedAt) {
      patchInboxRow(msg.conversationId, (c) => (c.lastMessageAt === msg.createdAt ? { ...c, lastMessagePreview: 'Message deleted' } : c));
    }
  }, [userId, markRead, loadThreadMeta, loadInbox, patchInboxRow]);

  const onMemberRow = useCallback((row: { conversation_id: string; user_id: string; last_read_at: string; muted: boolean }, isInsert: boolean) => {
    const openId = selectedRef.current;
    if (isInsert && row.user_id === userId) {
      void loadInbox();
      return;
    }
    if (row.conversation_id === openId) {
      if (isInsert) void loadThreadMeta(openId);
      else setThread((t) => (t && t.id === openId ? { ...t, members: t.members.map((m) => (m.userId === row.user_id ? { ...m, lastReadAt: row.last_read_at } : m)) } : t));
    }
    if (!isInsert && row.user_id === userId) {
      // Read or muted on another device.
      patchInboxRow(row.conversation_id, (c) => ({
        ...c,
        muted: row.muted,
        unread: c.lastMessageAt && c.lastMessageAt <= row.last_read_at ? 0 : c.unread,
      }));
      refreshUnreadMessages();
    }
  }, [userId, loadInbox, loadThreadMeta, patchInboxRow]);

  const handlers = useRef({ onMessageRow, onMemberRow });
  useEffect(() => { handlers.current = { onMessageRow, onMemberRow }; }, [onMessageRow, onMemberRow]);

  const chatReady = !!inbox;
  useEffect(() => {
    if (!chatReady) return;
    const supabase = createClient();
    const filter = `organization_id=eq.${organizationId}`;
    const channel = supabase
      .channel(`chat:${organizationId}:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, (p) => handlers.current.onMessageRow(p.new as MessageRow, true))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter }, (p) => handlers.current.onMessageRow(p.new as MessageRow, false))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_members', filter }, (p) =>
        handlers.current.onMemberRow(p.new as { conversation_id: string; user_id: string; last_read_at: string; muted: boolean }, true))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter }, (p) =>
        handlers.current.onMemberRow(p.new as { conversation_id: string; user_id: string; last_read_at: string; muted: boolean }, false))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setLive(true);
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setLive(false);
      });
    // Never connected? Fall back to polling rather than waiting forever.
    const giveUp = setTimeout(() => setLive((l) => (l === true ? l : false)), 10_000);
    return () => {
      clearTimeout(giveUp);
      void supabase.removeChannel(channel);
    };
  }, [chatReady, organizationId, userId]);

  // Catch up whenever the screen comes back (phone unlocked, tab refocused) —
  // and keep checking on a timer if live updates aren't working.
  const catchUp = useCallback(async () => {
    await loadInbox();
    const id = selectedRef.current;
    if (!id) return;
    const data = await fetchLatest(id);
    if (data && selectedRef.current === id) {
      setThread((t) => (t && t.id === id ? { ...t, messages: mergeMessages(t.messages, data.messages) } : t));
      void loadThreadMeta(id);
      markRead(id);
    }
  }, [loadInbox, fetchLatest, loadThreadMeta, markRead]);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void catchUp(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [catchUp]);

  useEffect(() => {
    if (live !== false) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') void catchUp(); }, POLL_MS);
    return () => clearInterval(t);
  }, [live, catchUp]);

  // ---- Sending ------------------------------------------------------------
  const deliver = useCallback(async (convId: string, local: UIMessage) => {
    const fd = new FormData();
    fd.set('body', local.body ?? '');
    if (local.clientId) fd.set('clientId', local.clientId);
    if (local.localFile) fd.set('file', local.localFile);
    try {
      const res = await fetch(`/api/messages/conversations/${convId}/messages`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Not sent');
      const server = data.message as ChatMessage;
      setThread((t) => (t && t.id === convId ? { ...t, messages: upsertMessage(t.messages, server) } : t));
      patchInboxRow(
        convId,
        (c) => ({ ...c, lastMessageAt: server.createdAt, lastMessagePreview: previewOf(server), lastMessageSenderId: userId, unread: 0 }),
        true,
      );
    } catch (err) {
      const message = err instanceof Error && err.message !== 'Failed to fetch' ? err.message : 'No connection';
      setThread((t) =>
        t && t.id === convId
          ? { ...t, messages: t.messages.map((m) => (m.clientId === local.clientId && m.status ? { ...m, status: 'failed', error: message } : m)) }
          : t,
      );
    }
  }, [patchInboxRow, userId]);

  const send = useCallback((text: string, file: File | null) => {
    const convId = selectedRef.current;
    if (!convId) return;
    const clientId = newClientId();
    const local: UIMessage = {
      id: `local-${clientId}`,
      conversationId: convId,
      senderId: userId,
      kind: file ? (/^image\/(jpeg|png|webp|gif)$/.test(file.type) ? 'image' : 'file') : 'text',
      body: text || null,
      attachment: file ? { name: file.name, mime: file.type, size: file.size, url: URL.createObjectURL(file) } : null,
      clientId,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      status: 'sending',
      localFile: file ?? undefined,
    };
    setThread((t) => (t && t.id === convId ? { ...t, messages: sortMessages([...t.messages, local]) } : t));
    void deliver(convId, local);
  }, [userId, deliver]);

  const retry = useCallback((m: UIMessage) => {
    const convId = selectedRef.current;
    if (!convId) return;
    const again: UIMessage = { ...m, status: 'sending', error: undefined };
    setThread((t) => (t && t.id === convId ? { ...t, messages: t.messages.map((x) => (x.id === m.id ? again : x)) } : t));
    void deliver(convId, again);
  }, [deliver]);

  const removeMessage = useCallback(async (m: UIMessage) => {
    if (!window.confirm('Delete this message for everyone?')) return;
    const res = await fetch(`/api/messages/message/${m.id}`, { method: 'DELETE' }).catch(() => null);
    if (!res?.ok) {
      const data = await res?.json().catch(() => ({}));
      window.alert(data?.error || 'Could not delete the message.');
      return;
    }
    setThread((t) =>
      t ? { ...t, messages: t.messages.map((x) => (x.id === m.id ? { ...x, deletedAt: new Date().toISOString(), body: null, attachment: null } : x)) } : t,
    );
  }, []);

  // ---- Starting chats + group actions ------------------------------------
  const startDirect = useCallback(async (otherUserId: string): Promise<string | null> => {
    const res = await fetch('/api/messages/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'direct', userId: otherUserId }),
    }).catch(() => null);
    if (!res?.ok) return null;
    const { id } = (await res.json()) as { id: string };
    await loadInbox();
    openConversation(id);
    return id;
  }, [loadInbox, openConversation]);

  const createGroup = useCallback(async (input: { title: string; memberIds: string[]; announcement: boolean }) => {
    const res = await fetch('/api/messages/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'group', ...input }),
    }).catch(() => null);
    if (!res?.ok) return null;
    const { id } = (await res.json()) as { id: string };
    await loadInbox();
    openConversation(id);
    return id;
  }, [loadInbox, openConversation]);

  const call = useCallback(async (url: string, init: RequestInit): Promise<string | null> => {
    const res = await fetch(url, init).catch(() => null);
    if (!res) return 'No connection. Please try again.';
    if (res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data.error || 'Something went wrong.';
  }, []);

  /**
   * One change from the info panel: call the API, then either refresh the
   * open chat (rename, mute, members…) or close it (left / deleted).
   */
  const infoOp = useCallback(async (
    id: string,
    path: string,
    init: RequestInit,
    then: 'refresh' | 'close',
  ): Promise<string | null> => {
    const err = await call(`/api/messages/conversations/${id}${path}`, init);
    if (err) return err;
    if (then === 'close') {
      openConversation(null);
      await loadInbox();
    } else {
      await loadThreadMeta(id);
    }
    refreshUnreadMessages();
    return null;
  }, [call, openConversation, loadInbox, loadThreadMeta]);

  const infoActionsFor = (id: string): InfoActions => ({
    rename: (title) => infoOp(id, '', jsonInit('PATCH', { title }), 'refresh'),
    setAnnouncement: (on) => infoOp(id, '', jsonInit('PATCH', { announcement: on }), 'refresh'),
    setMuted: (on) => infoOp(id, '', jsonInit('PATCH', { muted: on }), 'refresh'),
    addMembers: (userIds) => infoOp(id, '/members', jsonInit('POST', { userIds }), 'refresh'),
    removeMember: (uid) => infoOp(id, `/members?userId=${encodeURIComponent(uid)}`, { method: 'DELETE' }, 'refresh'),
    leave: () => infoOp(id, `/members?userId=${encodeURIComponent(userId)}`, { method: 'DELETE' }, 'close'),
    remove: () => infoOp(id, '', jsonInit('PATCH', { archived: true }), 'close'),
    messagePerson: (uid) => { void startDirect(uid); },
  });

  // ---- Render -------------------------------------------------------------
  const height = isMobile
    ? `calc(100dvh - ${rootTop}px - var(--bottom-nav-h) - env(safe-area-inset-bottom, 0px))`
    : `calc(100dvh - ${rootTop}px - 24px)`;

  if (inboxError && !inbox) {
    return (
      <div ref={rootRef} className={styles.notice}>
        <span className={styles.placeholderIcon}><FleetIcon name="chat" size={26} /></span>
        <h3>{inboxError.disabled ? 'Messages is switched off' : inboxError.needsMigration ? 'Almost ready' : 'Messages unavailable'}</h3>
        <p style={{ margin: 0, maxWidth: 420 }}>
          {inboxError.disabled
            ? variant === 'fleet'
              ? 'Your fleet has the Messages module turned off.'
              : 'Your fleet hasn’t turned on messages in Rovora yet.'
            : inboxError.message}
        </p>
        {inboxError.disabled && variant === 'fleet' && (
          <Link href="/fleet/integrations" className={styles.primaryBtn} style={{ textDecoration: 'none' }}>
            Turn it on in Integrations
          </Link>
        )}
        {!inboxError.disabled && (
          <button type="button" className={styles.ghostBtn} onClick={() => void loadInbox()}>
            <FleetIcon name="refresh" size={14} /> Try again
          </button>
        )}
      </div>
    );
  }

  const showList = !isMobile || !selectedId;
  const showThread = !isMobile || !!selectedId;
  const conversation = thread?.conversation ?? null;
  const me = inbox?.me;

  return (
    <div ref={rootRef} className={`${styles.root} ${isMobile ? styles.rootSingle : ''}`} style={{ height }}>
      {showList && (
        inbox ? (
          <ConversationList
            conversations={inbox.conversations}
            selectedId={selectedId}
            meId={userId}
            isAdmin={!!me?.isAdmin}
            isManager={!!me?.isManager}
            live={live}
            onSelect={(id) => openConversation(id)}
            onNew={() => setDialog('new')}
            onSettings={() => setDialog('settings')}
          />
        ) : (
          <aside className={styles.list}>
            <div className={styles.placeholder}>Loading chats…</div>
          </aside>
        )
      )}

      {showThread && (
        thread && conversation ? (
          <ThreadView
            key={conversation.id}
            conversation={conversation}
            messages={thread.messages}
            members={thread.members}
            people={people}
            meId={userId}
            isManager={!!me?.isManager}
            isMobile={isMobile}
            loading={thread.loading}
            hasMore={thread.hasMore}
            loadingOlder={thread.loadingOlder}
            error={thread.error}
            onBack={() => openConversation(null)}
            onOpenInfo={() => setDialog('info')}
            onSend={send}
            onRetry={retry}
            onDelete={removeMessage}
            onLoadOlder={loadOlder}
            onViewImage={(src, download) => setLightbox({ src, download })}
          />
        ) : thread ? (
          <section className={styles.thread}>
            {isMobile && (
              <div className={styles.threadHead}>
                <button type="button" className={`${styles.iconBtn} ${styles.iconBtnBare}`} onClick={() => openConversation(null)} aria-label="Back to chats">
                  <FleetIcon name="chevron-left" size={20} stroke={2} />
                </button>
              </div>
            )}
            <div className={styles.placeholder}>{thread.error ?? 'Loading…'}</div>
          </section>
        ) : (
          <section className={styles.thread}>
            <div className={styles.placeholder}>
              <span className={styles.placeholderIcon}><FleetIcon name="chat" size={26} /></span>
              <h3>Your fleet’s chats, in one place</h3>
              <p>
                {me?.isManager
                  ? 'Message a driver, set up groups like “Night shift” or “Airport”, or post to Everyone. People join and leave automatically with your fleet.'
                  : 'Message your managers, and keep up with your fleet’s groups.'}
              </p>
              <button type="button" className={styles.primaryBtn} onClick={() => setDialog('new')}>
                <FleetIcon name="plus" size={14} stroke={2} /> New chat
              </button>
            </div>
          </section>
        )
      )}

      {dialog === 'new' && inbox && (
        <NewChatDialog
          isManager={inbox.me.isManager}
          driverDms={inbox.settings.driverDms}
          onClose={() => setDialog(null)}
          onStartDirect={startDirect}
          onCreateGroup={createGroup}
        />
      )}

      {dialog === 'info' && conversation && (
        <ChatInfoPanel
          conversation={conversation}
          members={thread?.members ?? []}
          meId={userId}
          isManager={!!me?.isManager}
          onClose={() => setDialog(null)}
          actions={infoActionsFor(conversation.id)}
        />
      )}

      {dialog === 'settings' && inbox && (
        <SettingsDialog
          driverDms={inbox.settings.driverDms}
          onClose={() => setDialog(null)}
          onSave={async (driverDms) => {
            const err = await call('/api/messages/settings', jsonInit('PATCH', { driverDms }));
            if (!err) setInbox((prev) => (prev ? { ...prev, settings: { ...prev.settings, driverDms } } : prev));
            return err;
          }}
        />
      )}

      {lightbox && mounted && createPortal(
        <div className={styles.lightbox} onClick={() => setLightbox(null)} role="dialog" aria-label="Photo">
          <div className={styles.lightboxBar} onClick={(e) => e.stopPropagation()}>
            {lightbox.download && (
              <a className={styles.lightboxBtn} href={lightbox.download} aria-label="Download photo">
                <FleetIcon name="download" size={18} />
              </a>
            )}
            <button type="button" className={styles.lightboxBtn} onClick={() => setLightbox(null)} aria-label="Close">
              <FleetIcon name="close" size={18} stroke={2} />
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.src} alt="" onClick={(e) => e.stopPropagation()} />
        </div>,
        document.body,
      )}
    </div>
  );
}

function SettingsDialog({
  driverDms,
  onClose,
  onSave,
}: {
  driverDms: boolean;
  onClose: () => void;
  onSave: (driverDms: boolean) => Promise<string | null>;
}) {
  const [value, setValue] = useState(driverDms);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <ChatModal
      title="Chat settings"
      onClose={onClose}
      footer={
        <>
          <button type="button" className={styles.ghostBtn} onClick={onClose}>Cancel</button>
          <button
            type="button"
            className={styles.primaryBtn}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const err = await onSave(value);
              setBusy(false);
              if (err) setError(err);
              else onClose();
            }}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <label className={styles.check}>
        <input type="checkbox" checked={value} onChange={(e) => setValue(e.target.checked)} />
        <span>
          Let drivers message each other privately
          <span className={styles.checkHint}>
            Off: drivers can message managers, and talk to each other in the groups you create. On: drivers can also start
            one-to-one chats with other drivers.
          </span>
        </span>
      </label>
      {error && <p className={styles.error}>{error}</p>}
    </ChatModal>
  );
}
