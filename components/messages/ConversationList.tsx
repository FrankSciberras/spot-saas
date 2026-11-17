'use client';

import { useEffect, useMemo, useState } from 'react';
import FleetIcon from '@/components/fleet/FleetIcon';
import type { ChatConversation } from '@/lib/messages/types';
import ChatAvatar from './ChatAvatar';
import { listTime } from './format';
import { badgeText } from './useUnreadMessages';
import styles from './messages.module.css';

export default function ConversationList({
  conversations,
  selectedId,
  meId,
  isAdmin,
  isManager,
  live,
  onSelect,
  onNew,
  onSettings,
}: {
  conversations: ChatConversation[];
  selectedId: string | null;
  meId: string;
  isAdmin: boolean;
  isManager: boolean;
  live: boolean | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onSettings: () => void;
}) {
  const [query, setQuery] = useState('');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? conversations.filter((c) => c.title.toLowerCase().includes(q)) : conversations;
  }, [conversations, query]);

  const onlyEveryone = conversations.length <= 1;

  return (
    <aside className={styles.list} aria-label="Chats">
      <div className={styles.listHead}>
        <h2 className={styles.listTitle}>
          Chats{' '}
          <span
            className={`${styles.liveDot} ${live === false ? styles.liveDotOff : ''}`}
            title={live === false ? 'Live updates unavailable, checking for new messages every few seconds' : 'Live'}
            style={{ verticalAlign: 'middle', marginLeft: 4, opacity: live === null ? 0 : 1 }}
          />
        </h2>
        {isAdmin && (
          <button type="button" className={styles.iconBtn} onClick={onSettings} aria-label="Chat settings" title="Chat settings">
            <FleetIcon name="adjust" size={16} />
          </button>
        )}
        <button type="button" className={styles.iconBtn} onClick={onNew} aria-label="New chat" title="New chat">
          <FleetIcon name="plus" size={17} stroke={2} />
        </button>
      </div>

      {conversations.length > 4 && (
        <div className={styles.search}>
          <FleetIcon name="search" size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats" aria-label="Search chats" />
        </div>
      )}

      <div className={styles.rows}>
        {shown.map((c) => {
          const unread = c.unread > 0;
          const prefix =
            c.lastMessageSenderId && c.lastMessagePreview
              ? c.lastMessageSenderId === meId
                ? 'You: '
                : c.kind === 'group' && c.lastMessageSenderName
                  ? `${c.lastMessageSenderName.split(' ')[0]}: `
                  : ''
              : '';
          return (
            <button
              key={c.id}
              type="button"
              className={`${styles.row} ${c.id === selectedId ? styles.rowActive : ''}`}
              onClick={() => onSelect(c.id)}
              aria-current={c.id === selectedId ? 'true' : undefined}
            >
              {c.kind === 'group' ? (
                <ChatAvatar group={{ id: c.id, isEveryone: c.isEveryone, announcement: c.announcement }} />
              ) : (
                <ChatAvatar person={c.other} />
              )}
              <span className={styles.rowMain}>
                <span className={styles.rowTop}>
                  <span className={`${styles.rowTitle} ${unread ? styles.rowTitleUnread : ''}`}>{c.title}</span>
                  <span className={`${styles.rowTime} ${unread && !c.muted ? styles.rowTimeUnread : ''}`}>
                    {listTime(c.lastMessageAt ?? c.createdAt, now)}
                  </span>
                </span>
                <span className={styles.rowBottom}>
                  <span className={`${styles.rowPreview} ${unread ? styles.rowPreviewUnread : ''}`}>
                    {c.announcement && <FleetIcon name="megaphone" size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />}
                    {c.lastMessagePreview ? `${prefix}${c.lastMessagePreview}` : c.kind === 'direct' ? 'Say hello 👋' : 'No messages yet'}
                  </span>
                  {c.muted && (
                    <span className={styles.mutedIcon} title="Muted">
                      <FleetIcon name="bell-off" size={13} />
                    </span>
                  )}
                  {unread && <span className={`${styles.unreadPill} ${c.muted ? styles.unreadPillMuted : ''}`}>{badgeText(c.unread)}</span>}
                </span>
              </span>
            </button>
          );
        })}

        {shown.length === 0 && query && <div className={styles.listEmpty}>No chats match “{query}”.</div>}

        {onlyEveryone && !query && (
          <div className={styles.listEmpty}>
            <span>{isManager ? 'Start a private chat, or set up groups for your team.' : 'Message your managers directly.'}</span>
            <button type="button" className={styles.primaryBtn} onClick={onNew}>
              <FleetIcon name="plus" size={14} stroke={2} /> New chat
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
