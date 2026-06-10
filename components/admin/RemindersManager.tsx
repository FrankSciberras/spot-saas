'use client';

import { type CSSProperties, type ReactNode, useState, useEffect, useCallback, useMemo } from 'react';
import type {
  Reminder,
  ReminderPriority,
  ReminderStatus,
  ReminderRecurring,
  User,
} from '@/lib/types/database';
import type { ResourcePermissions } from '@/lib/permissions-config';
import FleetIcon from '@/components/fleet/FleetIcon';

interface RemindersManagerProps {
  initialReminders: Reminder[];
  users: Pick<User, 'id' | 'full_name' | 'email' | 'role'>[];
  isAdmin: boolean;
  permissions: ResourcePermissions;
}

const PRIORITY_OPTIONS: { value: ReminderPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const STATUS_OPTIONS: { value: ReminderStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const RECURRING_OPTIONS: { value: '' | ReminderRecurring; label: string }[] = [
  { value: '', label: 'None (one-time)' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

const PRIORITY_STYLE: Record<ReminderPriority, { color: string; bg: string }> = {
  low: { color: 'var(--text-2)', bg: 'var(--bg-2)' },
  medium: { color: 'var(--accent)', bg: 'var(--accent-soft)' },
  high: { color: 'var(--warn)', bg: 'var(--warn-soft)' },
  urgent: { color: 'var(--neg)', bg: 'var(--neg-soft)' },
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isOverdue(dueDate: string | null, status: string) {
  if (!dueDate || status === 'completed' || status === 'cancelled') return false;
  return new Date(dueDate) < new Date();
}

function toLocalDatetimeInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toLocalDateInput(iso: string | null) {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function Stat({ label, value, icon, accent }: { label: string; value: ReactNode; icon: string; accent: string }) {
  return (
    <div style={st.stat}>
      <div style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--bg-2)', color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <FleetIcon name={icon} size={15} />
      </div>
      <div style={{ marginTop: 14 }}>
        <span className="mono tnum" style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-0.02em', color: accent }}>{value}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function RemindersManager({
  initialReminders,
  users,
  isAdmin,
  permissions,
}: RemindersManagerProps) {
  const [reminders, setReminders] = useState<Reminder[]>(initialReminders);
  const [filterStatus, setFilterStatus] = useState<string>('active');
  const [filterPriority, setFilterPriority] = useState<string>('');
  const [filterAssigned, setFilterAssigned] = useState<string>('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form
  const [fTitle, setFTitle] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fPriority, setFPriority] = useState<ReminderPriority>('medium');
  const [fAssigned, setFAssigned] = useState<string>('');
  const [fDueDate, setFDueDate] = useState('');
  const [fRemindAt, setFRemindAt] = useState('');
  const [fRecurring, setFRecurring] = useState<'' | ReminderRecurring>('');
  const [fRecurringEnd, setFRecurringEnd] = useState('');
  const [fStatus, setFStatus] = useState<ReminderStatus>('pending');

  const canCreate = permissions.can_create;
  const canEdit = permissions.can_edit;
  const canDelete = permissions.can_delete;

  const resetForm = useCallback(() => {
    setFTitle(''); setFDesc(''); setFPriority('medium'); setFAssigned('');
    setFDueDate(''); setFRemindAt(''); setFRecurring(''); setFRecurringEnd('');
    setFStatus('pending'); setEditing(null); setError(null);
  }, []);

  const openAdd = () => {
    if (!canCreate) return;
    resetForm();
    setShowModal(true);
  };

  const openEdit = (r: Reminder) => {
    if (!canEdit) return;
    setEditing(r);
    setFTitle(r.title);
    setFDesc(r.description || '');
    setFPriority(r.priority);
    setFAssigned(r.assigned_to || '');
    setFDueDate(toLocalDatetimeInput(r.due_date));
    setFRemindAt(toLocalDatetimeInput(r.remind_at));
    setFRecurring(r.recurring || '');
    setFRecurringEnd(toLocalDateInput(r.recurring_end_date));
    setFStatus(r.status);
    setError(null);
    setShowModal(true);
  };

  const handleSave = async () => {
    if ((editing && !canEdit) || (!editing && !canCreate)) {
      setError('You do not have permission to save reminders.');
      return;
    }

    if (!fTitle.trim()) { setError('Title is required'); return; }
    setSaving(true); setError(null);

    try {
      const body: Record<string, unknown> = {
        title: fTitle.trim(),
        description: fDesc.trim() || null,
        priority: fPriority,
        assigned_to: fAssigned || null,
        due_date: fDueDate ? new Date(fDueDate).toISOString() : null,
        remind_at: fRemindAt ? new Date(fRemindAt).toISOString() : null,
        recurring: fRecurring || null,
        recurring_end_date: fRecurringEnd ? new Date(fRecurringEnd + 'T23:59:59').toISOString() : null,
      };

      if (editing) {
        body.status = fStatus;
        const res = await fetch(`/api/reminders/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Update failed'); }
        const { data } = await res.json();
        setReminders(prev => prev.map(r => r.id === data.id ? data : r));
      } else {
        const res = await fetch('/api/reminders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Create failed'); }
        const { data } = await res.json();
        setReminders(prev => [data, ...prev]);
      }

      setShowModal(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally { setSaving(false); }
  };

  const toggleComplete = async (r: Reminder) => {
    if (!canEdit) return;
    const newStatus = r.status === 'completed' ? 'pending' : 'completed';
    try {
      const res = await fetch(`/api/reminders/${r.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) return;
      const { data } = await res.json();
      setReminders(prev => prev.map(x => x.id === data.id ? data : x));
    } catch { /* ignore */ }
  };

  const handleDelete = async (id: string) => {
    if (!canDelete) return;
    try {
      const res = await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setReminders(prev => prev.filter(r => r.id !== id));
        setDeletingId(null);
      }
    } catch { /* ignore */ }
  };

  // Close modal on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowModal(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Filter
  const filtered = useMemo(() => reminders.filter(r => {
    if (filterStatus === 'active' && (r.status === 'completed' || r.status === 'cancelled')) return false;
    if (filterStatus && filterStatus !== 'all' && filterStatus !== 'active' && r.status !== filterStatus) return false;
    if (filterPriority && r.priority !== filterPriority) return false;
    if (filterAssigned && r.assigned_to !== filterAssigned) return false;
    return true;
  }), [reminders, filterStatus, filterPriority, filterAssigned]);

  // Stats
  const total = reminders.length;
  const pending = reminders.filter(r => r.status === 'pending' || r.status === 'in_progress').length;
  const overdue = reminders.filter(r => isOverdue(r.due_date, r.status)).length;
  const completed = reminders.filter(r => r.status === 'completed').length;

  const STATUS_TABS: { k: string; label: string; dot?: string }[] = [
    { k: 'active', label: 'Active', dot: 'var(--accent)' },
    { k: 'all', label: 'All' },
    { k: 'pending', label: 'Pending', dot: 'var(--text-3)' },
    { k: 'in_progress', label: 'In progress', dot: 'var(--warn)' },
    { k: 'completed', label: 'Completed', dot: 'var(--pos)' },
    { k: 'cancelled', label: 'Cancelled', dot: 'var(--neg)' },
  ];

  return (
    <>
      <div style={st.header} className="header-mobile-row">
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>Tasks / Reminders</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>Reminders &amp; To-Do</h1>
            <span className="mono tnum" style={{ fontSize: 14, color: 'var(--text-3)' }}>{total}</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 4 }}>Track tasks, set reminders, and manage recurring to-dos</div>
        </div>
        {canCreate && (
          <button style={st.primaryBtn} className="fleetHover" onClick={openAdd}>
            <FleetIcon name="plus" size={14} stroke={2.2} /> Add reminder
          </button>
        )}
      </div>

      <div style={st.statsRow} className="stats-row-mobile">
        <Stat label="Total" value={total} icon="doc" accent="var(--text-1)" />
        <Stat label="Active" value={pending} icon="bell" accent="var(--accent)" />
        <Stat label="Overdue" value={overdue} icon="warning" accent="var(--neg)" />
        <Stat label="Done" value={completed} icon="check" accent="var(--pos)" />
      </div>

      <div style={st.filterBar} className="header-mobile-row">
        <div style={st.tabs} className="chips-scroll full-mobile">
          {STATUS_TABS.map((t) => (
            <button key={t.k} onClick={() => setFilterStatus(t.k)} style={{ ...st.tab, ...(filterStatus === t.k ? st.tabActive : {}) }}>
              {t.dot && <span style={{ width: 6, height: 6, borderRadius: 99, background: t.dot }} />}
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }} className="full-mobile">
          <select className="fleetSelect" style={st.select} value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
            <option value="">All priorities</option>
            {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {isAdmin && (
            <select className="fleetSelect" style={st.select} value={filterAssigned} onChange={e => setFilterAssigned(e.target.value)}>
              <option value="">All assignees</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
            </select>
          )}
        </div>
      </div>

      <div style={st.card}>
        {filtered.length === 0 ? (
          <div style={{ padding: '56px 20px', textAlign: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: 11, background: 'var(--bg-2)', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <FleetIcon name="bell" size={20} />
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 500, color: 'var(--text-1)' }}>No reminders</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 4 }}>
              {canCreate ? 'Click “Add reminder” to create your first one.' : 'There are no reminders to show right now.'}
            </div>
          </div>
        ) : (
          filtered.map((r, i) => {
            const done = r.status === 'completed';
            const cancelled = r.status === 'cancelled';
            const overdueRow = isOverdue(r.due_date, r.status);
            const pri = PRIORITY_STYLE[r.priority];
            return (
              <div
                key={r.id}
                style={{
                  ...st.row,
                  borderBottom: i < filtered.length - 1 ? '1px solid var(--line-1)' : 'none',
                  opacity: cancelled ? 0.55 : 1,
                }}
              >
                <button
                  onClick={() => toggleComplete(r)}
                  title={done ? 'Mark as pending' : 'Mark as done'}
                  disabled={!canEdit}
                  style={{
                    ...st.check,
                    background: done ? 'var(--pos)' : 'transparent',
                    borderColor: done ? 'var(--pos)' : 'var(--line-2)',
                    color: done ? '#fff' : 'transparent',
                    cursor: canEdit ? 'pointer' : 'default',
                  }}
                >
                  <FleetIcon name="check" size={13} stroke={3} />
                </button>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)', textDecoration: done ? 'line-through' : 'none' }}>{r.title}</span>
                    <span style={{ ...st.pill, color: pri.color, background: pri.bg }}>{r.priority}</span>
                    {r.recurring && <span style={{ ...st.pill, color: 'var(--text-2)', background: 'var(--bg-2)' }}>↻ {r.recurring}</span>}
                  </div>
                  {r.description && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.45 }}>{r.description}</div>}
                  <div style={st.metaRow}>
                    {r.due_date && (
                      <span style={{ ...st.meta, color: overdueRow ? 'var(--neg)' : 'var(--text-3)' }}>
                        <FleetIcon name="roster" size={12} />
                        {overdueRow ? 'Overdue: ' : 'Due: '}{formatDate(r.due_date)}
                      </span>
                    )}
                    {r.remind_at && !r.reminder_sent && (
                      <span style={st.meta}><FleetIcon name="bell" size={12} /> Remind: {formatDateTime(r.remind_at)}</span>
                    )}
                    {r.assignee && (
                      <span style={st.meta}><FleetIcon name="staff" size={12} /> {r.assignee.full_name || r.assignee.email}</span>
                    )}
                    <span style={st.meta}>{formatDate(r.created_at)}</span>
                  </div>
                </div>

                {(canEdit || canDelete) && (
                  <div style={st.actions}>
                    {canEdit && (
                      <button style={st.actionBtn} className="fleetHover" onClick={() => openEdit(r)}>Edit</button>
                    )}
                    {canDelete && (
                      deletingId === r.id ? (
                        <>
                          <button style={{ ...st.actionBtn, color: 'var(--neg)', borderColor: 'var(--neg)' }} onClick={() => handleDelete(r.id)}>Confirm</button>
                          <button style={st.actionBtn} className="fleetHover" onClick={() => setDeletingId(null)}>Cancel</button>
                        </>
                      ) : (
                        <button style={{ ...st.actionBtn, color: 'var(--neg)' }} className="fleetHover" onClick={() => setDeletingId(r.id)}>Delete</button>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={st.overlay} onClick={() => setShowModal(false)}>
          <div style={st.modal} onClick={e => e.stopPropagation()}>
            <div style={st.modalHeader}>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-1)' }}>{editing ? 'Edit reminder' : 'New reminder'}</div>
              <button style={st.modalClose} className="fleetHover" onClick={() => setShowModal(false)}><FleetIcon name="close" size={15} /></button>
            </div>

            <div style={st.modalBody}>
              {error && <div style={st.error}>{error}</div>}

              <div style={st.field}>
                <label style={st.label}>Title *</label>
                <input style={st.input} type="text" value={fTitle} onChange={e => setFTitle(e.target.value)} placeholder="What needs to be done?" autoFocus />
              </div>

              <div style={st.field}>
                <label style={st.label}>Description</label>
                <textarea style={{ ...st.input, minHeight: 72, resize: 'vertical' }} value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder="Optional details…" />
              </div>

              <div style={st.fieldRow}>
                <div style={st.field}>
                  <label style={st.label}>Priority</label>
                  <select style={st.input} value={fPriority} onChange={e => setFPriority(e.target.value as ReminderPriority)}>
                    {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {editing ? (
                  <div style={st.field}>
                    <label style={st.label}>Status</label>
                    <select style={st.input} value={fStatus} onChange={e => setFStatus(e.target.value as ReminderStatus)}>
                      {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                ) : (
                  <div style={st.field}>
                    <label style={st.label}>Assign to</label>
                    <select style={st.input} value={fAssigned} onChange={e => setFAssigned(e.target.value)}>
                      <option value="">Myself</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {editing && (
                <div style={st.field}>
                  <label style={st.label}>Assign to</label>
                  <select style={st.input} value={fAssigned} onChange={e => setFAssigned(e.target.value)}>
                    <option value="">Unassigned (creator)</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
                  </select>
                </div>
              )}

              <div style={st.fieldRow}>
                <div style={st.field}>
                  <label style={st.label}>Due date</label>
                  <input style={st.input} type="datetime-local" value={fDueDate} onChange={e => setFDueDate(e.target.value)} />
                </div>
                <div style={st.field}>
                  <label style={st.label}>Remind me at</label>
                  <input style={st.input} type="datetime-local" value={fRemindAt} onChange={e => setFRemindAt(e.target.value)} />
                </div>
              </div>

              <div style={st.fieldRow}>
                <div style={st.field}>
                  <label style={st.label}>Recurring</label>
                  <select style={st.input} value={fRecurring} onChange={e => setFRecurring(e.target.value as '' | ReminderRecurring)}>
                    {RECURRING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {fRecurring && (
                  <div style={st.field}>
                    <label style={st.label}>Recurring until</label>
                    <input style={st.input} type="date" value={fRecurringEnd} onChange={e => setFRecurringEnd(e.target.value)} />
                  </div>
                )}
              </div>
            </div>

            <div style={st.modalFooter}>
              <button style={st.secondaryBtn} className="fleetHover" onClick={() => setShowModal(false)} disabled={saving}>Cancel</button>
              <button style={st.primaryBtn} className="fleetHover" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const st: Record<string, CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 0 18px' },
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 7, fontSize: 13, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' },
  secondaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: 'var(--bg-1)', border: '1px solid var(--line-2)', color: 'var(--text-1)', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 },
  stat: { padding: '14px 16px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 10 },
  filterBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12 },
  tabs: { display: 'inline-flex', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 8, padding: 3, gap: 1 },
  tab: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', background: 'transparent', border: 'none', color: 'var(--text-2)', fontSize: 12.5, fontFamily: 'inherit', borderRadius: 5, whiteSpace: 'nowrap', cursor: 'pointer' },
  tabActive: { background: 'var(--bg-3)', color: 'var(--text-1)', boxShadow: 'inset 0 0 0 1px var(--line-2)' },
  select: { padding: '7px 10px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 7, color: 'var(--text-1)', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' },
  card: { background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
  row: { display: 'flex', alignItems: 'flex-start', gap: 13, padding: '14px 18px' },
  check: { width: 22, height: 22, flexShrink: 0, marginTop: 1, borderRadius: 7, border: '1.5px solid var(--line-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease' },
  pill: { display: 'inline-flex', alignItems: 'center', fontSize: 10.5, fontFamily: 'Geist Mono, monospace', padding: '2px 7px', borderRadius: 5, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' },
  metaRow: { display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 7 },
  meta: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--text-3)' },
  actions: { display: 'flex', gap: 6, flexShrink: 0 },
  actionBtn: { padding: '5px 11px', background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--text-2)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' },
  // Modal
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px', zIndex: 1000, overflowY: 'auto' },
  modal: { width: '100%', maxWidth: 560, background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 'var(--radius-lg)', boxShadow: '0 24px 60px rgba(0,0,0,0.6)', overflow: 'hidden' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 18px', borderBottom: '1px solid var(--line-1)' },
  modalClose: { width: 28, height: 28, borderRadius: 7, background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' },
  modalBody: { padding: 18, display: 'flex', flexDirection: 'column', gap: 14 },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 18px', borderTop: '1px solid var(--line-1)' },
  field: { display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0 },
  fieldRow: { display: 'flex', gap: 12 },
  label: { fontSize: 12, color: 'var(--text-2)', fontWeight: 500 },
  input: { width: '100%', padding: '9px 11px', background: 'var(--bg-0)', border: '1px solid var(--line-2)', borderRadius: 7, color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit', outline: 'none' },
  error: { padding: '9px 12px', background: 'var(--neg-soft)', border: '1px solid var(--neg)', color: 'var(--neg)', borderRadius: 7, fontSize: 12.5 },
};
