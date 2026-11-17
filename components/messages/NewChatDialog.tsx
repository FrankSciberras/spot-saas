'use client';

import { useEffect, useMemo, useState } from 'react';
import FleetIcon from '@/components/fleet/FleetIcon';
import type { ChatPerson } from '@/lib/messages/types';
import ChatAvatar from './ChatAvatar';
import ChatModal from './ChatModal';
import { roleLabel } from './format';
import styles from './messages.module.css';

/**
 * Start a chat. Everyone can pick a person to message; managers also get a
 * "New group" tab (name, announcement-only switch, members).
 */
export default function NewChatDialog({
  isManager,
  driverDms,
  onClose,
  onStartDirect,
  onCreateGroup,
}: {
  isManager: boolean;
  driverDms: boolean;
  onClose: () => void;
  onStartDirect: (userId: string) => Promise<string | null>;
  onCreateGroup: (input: { title: string; memberIds: string[]; announcement: boolean }) => Promise<string | null>;
}) {
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [contacts, setContacts] = useState<ChatPerson[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [announcement, setAnnouncement] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/messages/contacts', { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setLoadError(data.error || 'Could not load people.');
        else setContacts(data.contacts ?? []);
      })
      .catch(() => !cancelled && setLoadError('Could not load people.'));
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = contacts ?? [];
    return q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list;
  }, [contacts, query]);

  const managers = filtered.filter((p) => p.isManager);
  const drivers = filtered.filter((p) => !p.isManager);

  const startDirect = async (userId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const id = await onStartDirect(userId);
    setBusy(false);
    if (!id) setError('Could not start that chat. Please try again.');
  };

  const toggle = (userId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  const createGroup = async () => {
    if (busy) return;
    if (!title.trim()) { setError('Give the group a name.'); return; }
    if (!selected.size) { setError('Pick at least one person.'); return; }
    setBusy(true);
    setError(null);
    const id = await onCreateGroup({ title: title.trim(), memberIds: Array.from(selected), announcement });
    setBusy(false);
    if (!id) setError('Could not create the group. Please try again.');
  };

  const selectAllDrivers = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      (contacts ?? []).filter((p) => !p.isManager).forEach((p) => next.add(p.userId));
      return next;
    });

  const renderPerson = (p: ChatPerson) => {
    const isSel = selected.has(p.userId);
    return (
      <button
        key={p.userId}
        type="button"
        className={`${styles.person} ${mode === 'group' && isSel ? styles.personSelected : ''}`}
        onClick={() => (mode === 'group' ? toggle(p.userId) : startDirect(p.userId))}
        disabled={busy && mode === 'direct'}
        aria-pressed={mode === 'group' ? isSel : undefined}
      >
        <ChatAvatar person={p} size={34} />
        <span className={styles.personMain}>
          <span className={styles.personName}>{p.name}</span>
          <span className={styles.personRole}>{roleLabel(p.role, p.isManager)}</span>
        </span>
        {mode === 'group' && (
          <span style={{ color: isSel ? 'var(--accent)' : 'var(--text-4)', display: 'inline-flex' }}>
            <FleetIcon name={isSel ? 'check' : 'plus'} size={16} stroke={2} />
          </span>
        )}
      </button>
    );
  };

  const footer =
    mode === 'group' ? (
      <>
        <button type="button" className={styles.ghostBtn} onClick={onClose}>Cancel</button>
        <button type="button" className={styles.primaryBtn} onClick={createGroup} disabled={busy}>
          {busy ? 'Creating…' : `Create group${selected.size ? ` (${selected.size + 1})` : ''}`}
        </button>
      </>
    ) : undefined;

  return (
    <ChatModal title="New chat" onClose={onClose} footer={footer}>
      {isManager && (
        <div className={styles.tabs} role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'direct'} className={`${styles.tab} ${mode === 'direct' ? styles.tabActive : ''}`} onClick={() => { setMode('direct'); setError(null); }}>
            Message someone
          </button>
          <button type="button" role="tab" aria-selected={mode === 'group'} className={`${styles.tab} ${mode === 'group' ? styles.tabActive : ''}`} onClick={() => { setMode('group'); setError(null); }}>
            New group
          </button>
        </div>
      )}

      {mode === 'group' && (
        <>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="chat-group-title">Group name</label>
            <input
              id="chat-group-title"
              className={styles.input}
              value={title}
              maxLength={80}
              placeholder="e.g. Night shift, Airport runs"
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <label className={styles.check}>
            <input type="checkbox" checked={announcement} onChange={(e) => setAnnouncement(e.target.checked)} />
            <span>
              Announcements only
              <span className={styles.checkHint}>Only managers can post. Drivers read, without replies cluttering the group.</span>
            </span>
          </label>
        </>
      )}

      <div className={styles.search} style={{ margin: 0 }}>
        <FleetIcon name="search" size={15} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people"
          aria-label="Search people"
          autoFocus={mode === 'direct'}
        />
      </div>

      {error && <p className={styles.error}>{error}</p>}
      {loadError && <p className={styles.error}>{loadError}</p>}
      {!contacts && !loadError && <p className={styles.hint}>Loading people…</p>}

      {contacts && contacts.length === 0 && (
        <p className={styles.hint}>
          {isManager
            ? 'There is nobody else in your fleet yet. Add drivers or staff first.'
            : 'There are no managers to message yet.'}
        </p>
      )}

      {contacts && contacts.length > 0 && (
        <div className={styles.people}>
          {mode === 'group' && drivers.length > 1 && (
            <button type="button" className={styles.ghostBtn} style={{ alignSelf: 'flex-start', marginBottom: 6 }} onClick={selectAllDrivers}>
              <FleetIcon name="check" size={14} stroke={2} /> Add all drivers
            </button>
          )}
          {managers.length > 0 && <div className={styles.sectionLabel}>Managers</div>}
          {managers.map(renderPerson)}
          {drivers.length > 0 && <div className={styles.sectionLabel}>Drivers</div>}
          {drivers.map(renderPerson)}
          {filtered.length === 0 && <p className={styles.hint}>Nobody matches “{query}”.</p>}
        </div>
      )}

      {!isManager && !driverDms && contacts && contacts.length > 0 && (
        <p className={styles.hint}>You can message your fleet’s managers here. Chats with other drivers happen in groups.</p>
      )}
    </ChatModal>
  );
}
