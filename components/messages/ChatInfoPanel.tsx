'use client';

import { useEffect, useMemo, useState } from 'react';
import FleetIcon from '@/components/fleet/FleetIcon';
import type { ChatConversation, ChatMember, ChatPerson } from '@/lib/messages/types';
import ChatAvatar from './ChatAvatar';
import ChatModal from './ChatModal';
import { roleLabel } from './format';
import styles from './messages.module.css';

export interface InfoActions {
  rename: (title: string) => Promise<string | null>;
  setAnnouncement: (on: boolean) => Promise<string | null>;
  setMuted: (on: boolean) => Promise<string | null>;
  addMembers: (userIds: string[]) => Promise<string | null>;
  removeMember: (userId: string) => Promise<string | null>;
  leave: () => Promise<string | null>;
  remove: () => Promise<string | null>;
  messagePerson: (userId: string) => void;
}

/** Side drawer: who's in the chat and what you can change about it. Actions return an error message or null. */
export default function ChatInfoPanel({
  conversation,
  members,
  meId,
  isManager,
  onClose,
  actions,
}: {
  conversation: ChatConversation;
  members: ChatMember[];
  meId: string;
  isManager: boolean;
  onClose: () => void;
  actions: InfoActions;
}) {
  const isGroup = conversation.kind === 'group';
  const [title, setTitle] = useState(conversation.title);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [contacts, setContacts] = useState<ChatPerson[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Someone else renamed the group while this was open → show the new name.
  const [seenTitle, setSeenTitle] = useState(conversation.title);
  if (seenTitle !== conversation.title) {
    setSeenTitle(conversation.title);
    setTitle(conversation.title);
  }

  useEffect(() => {
    if (!adding || contacts) return;
    fetch('/api/messages/contacts', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setContacts(d.contacts ?? []))
      .catch(() => setError('Could not load people.'));
  }, [adding, contacts]);

  const memberIds = useMemo(() => new Set(members.map((m) => m.userId)), [members]);
  const addable = (contacts ?? []).filter((p) => !memberIds.has(p.userId));

  const run = async (fn: () => Promise<string | null>) => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    const err = await fn();
    setBusy(false);
    if (err) setError(err);
    return !err;
  };

  const saveTitle = () => {
    const t = title.trim();
    if (!t || t === conversation.title) { setTitle(conversation.title); return; }
    void run(() => actions.rename(t));
  };

  const other = conversation.other;

  return (
    <ChatModal title={isGroup ? 'Group info' : 'Chat info'} onClose={onClose} variant="drawer">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '6px 0 4px', textAlign: 'center' }}>
        {isGroup ? (
          <ChatAvatar size={64} group={{ id: conversation.id, isEveryone: conversation.isEveryone, announcement: conversation.announcement }} />
        ) : (
          <ChatAvatar size={64} person={other} />
        )}
        {isGroup && conversation.canManage ? (
          <input
            className={styles.input}
            style={{ textAlign: 'center', fontWeight: 600, width: '100%' }}
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            aria-label="Group name"
          />
        ) : (
          <div style={{ fontSize: 16, fontWeight: 600 }}>{conversation.title}</div>
        )}
        <div className={styles.hint}>
          {isGroup
            ? `${conversation.memberCount} ${conversation.memberCount === 1 ? 'member' : 'members'}${conversation.isEveryone ? ' · everyone in the fleet' : ''}`
            : other
              ? roleLabel(other.inFleet ? other.role : null, other.isManager)
              : ''}
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <label className={styles.check}>
        <input type="checkbox" checked={conversation.muted} disabled={busy} onChange={(e) => void run(() => actions.setMuted(e.target.checked))} />
        <span>
          Mute notifications
          <span className={styles.checkHint}>No pop-ups for this chat and it won’t count toward your unread badge.</span>
        </span>
      </label>

      {isGroup && conversation.canManage && (
        <label className={styles.check}>
          <input type="checkbox" checked={conversation.announcement} disabled={busy} onChange={(e) => void run(() => actions.setAnnouncement(e.target.checked))} />
          <span>
            Announcements only
            <span className={styles.checkHint}>Only managers can post in this group.</span>
          </span>
        </label>
      )}

      {conversation.isEveryone && (
        <p className={styles.hint}>
          Drivers and staff join this group automatically when they join your fleet, and are removed when they leave it.
        </p>
      )}

      {isGroup && (
        <div className={styles.people}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className={styles.sectionLabel}>Members</div>
            {conversation.canManage && !conversation.isEveryone && !adding && (
              <button type="button" className={styles.ghostBtn} style={{ padding: '5px 10px' }} onClick={() => setAdding(true)}>
                <FleetIcon name="plus" size={14} stroke={2} /> Add people
              </button>
            )}
          </div>

          {adding && (
            <div style={{ border: '1px solid var(--line-1)', borderRadius: 10, padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {!contacts && <p className={styles.hint}>Loading people…</p>}
              {contacts && addable.length === 0 && <p className={styles.hint}>Everyone is already in this group.</p>}
              {addable.map((p) => {
                const on = picked.has(p.userId);
                return (
                  <button
                    key={p.userId}
                    type="button"
                    className={`${styles.person} ${on ? styles.personSelected : ''}`}
                    onClick={() => setPicked((prev) => { const n = new Set(prev); if (n.has(p.userId)) n.delete(p.userId); else n.add(p.userId); return n; })}
                  >
                    <ChatAvatar person={p} size={30} />
                    <span className={styles.personMain}>
                      <span className={styles.personName}>{p.name}</span>
                      <span className={styles.personRole}>{roleLabel(p.role, p.isManager)}</span>
                    </span>
                    <FleetIcon name={on ? 'check' : 'plus'} size={15} stroke={2} />
                  </button>
                );
              })}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" className={styles.ghostBtn} onClick={() => { setAdding(false); setPicked(new Set()); }}>Cancel</button>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  disabled={!picked.size || busy}
                  onClick={async () => {
                    if (await run(() => actions.addMembers(Array.from(picked)))) { setAdding(false); setPicked(new Set()); }
                  }}
                >
                  Add {picked.size || ''}
                </button>
              </div>
            </div>
          )}

          {members.map((m) => (
            <div key={m.userId} className={styles.person}>
              <ChatAvatar person={m} size={34} />
              <span className={styles.personMain}>
                <span className={styles.personName}>{m.userId === meId ? `${m.name} (you)` : m.name}</span>
                <span className={styles.personRole}>{roleLabel(m.role, m.isManager)}</span>
              </span>
              {m.userId !== meId && (isManager || m.isManager) && (
                <button type="button" className={`${styles.iconBtn} ${styles.iconBtnBare}`} title={`Message ${m.name}`} aria-label={`Message ${m.name}`} onClick={() => actions.messagePerson(m.userId)}>
                  <FleetIcon name="chat" size={15} />
                </button>
              )}
              {conversation.canManage && !conversation.isEveryone && m.userId !== meId && (
                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.iconBtnBare}`}
                  title={`Remove ${m.name}`}
                  aria-label={`Remove ${m.name}`}
                  disabled={busy}
                  onClick={() => { if (window.confirm(`Remove ${m.name} from this group?`)) void run(() => actions.removeMember(m.userId)); }}
                >
                  <FleetIcon name="close" size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {isGroup && !conversation.isEveryone && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
          <button
            type="button"
            className={styles.dangerBtn}
            disabled={busy}
            onClick={() => { if (window.confirm('Leave this group? You won’t see new messages.')) void run(actions.leave); }}
          >
            <FleetIcon name="logout" size={15} /> Leave group
          </button>
          {isManager && (
            <button
              type="button"
              className={styles.dangerBtn}
              disabled={busy}
              onClick={() => { if (window.confirm('Delete this group for everyone? Its messages will no longer be visible.')) void run(actions.remove); }}
            >
              <FleetIcon name="trash" size={15} /> Delete group
            </button>
          )}
        </div>
      )}
    </ChatModal>
  );
}
