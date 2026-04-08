'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  Reminder,
  ReminderPriority,
  ReminderStatus,
  ReminderRecurring,
  User,
} from '@/lib/types/database';
import type { ResourcePermissions } from '@/lib/permissions-config';
import styles from './reminders.module.css';

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
  const filtered = reminders.filter(r => {
    if (filterStatus === 'active' && (r.status === 'completed' || r.status === 'cancelled')) return false;
    if (filterStatus && filterStatus !== 'all' && filterStatus !== 'active' && r.status !== filterStatus) return false;
    if (filterPriority && r.priority !== filterPriority) return false;
    if (filterAssigned && r.assigned_to !== filterAssigned) return false;
    return true;
  });

  // Stats
  const total = reminders.length;
  const pending = reminders.filter(r => r.status === 'pending' || r.status === 'in_progress').length;
  const overdue = reminders.filter(r => isOverdue(r.due_date, r.status)).length;
  const completed = reminders.filter(r => r.status === 'completed').length;

  const priorityClass = (p: ReminderPriority) => {
    switch (p) {
      case 'low': return styles.badgeLow;
      case 'medium': return styles.badgeMedium;
      case 'high': return styles.badgeHigh;
      case 'urgent': return styles.badgeUrgent;
    }
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2>Reminders &amp; To-Do</h2>
          <p className={styles.subtitle}>
            Track tasks, set reminders, and manage recurring to-dos
          </p>
        </div>
        <div>
          {canCreate && (
            <button className="btn btn-primary" onClick={openAdd}>+ Add Reminder</button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{total}</div>
          <div className={styles.statLabel}>Total</div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statValue} ${styles.statValuePrimary}`}>{pending}</div>
          <div className={styles.statLabel}>Active</div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statValue} ${styles.statValueDanger}`}>{overdue}</div>
          <div className={styles.statLabel}>Overdue</div>
        </div>
        <div className={styles.statCard}>
          <div className={`${styles.statValue} ${styles.statValueSuccess}`}>{completed}</div>
          <div className={styles.statLabel}>Done</div>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <select className={styles.filterSelect} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="active">Active</option>
          <option value="all">All</option>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className={styles.filterSelect} value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
          <option value="">All Priorities</option>
          {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {isAdmin && (
          <select className={styles.filterSelect} value={filterAssigned} onChange={e => setFilterAssigned(e.target.value)}>
            <option value="">All Assignees</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
          </select>
        )}
      </div>

      {/* List */}
      <div className={styles.reminderList}>
        {filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <h3>No reminders</h3>
            <p>
              {canCreate
                ? 'Click "Add Reminder" to create your first one.'
                : 'There are no reminders to show right now.'}
            </p>
          </div>
        ) : (
          filtered.map(r => (
            <div key={r.id} className={`${styles.reminderCard} ${r.status === 'completed' ? styles.completed : ''} ${r.status === 'cancelled' ? styles.cancelled : ''}`}>
              {/* Check circle */}
              <button
                className={`${styles.reminderCheck} ${r.status === 'completed' ? styles.checked : ''}`}
                onClick={() => toggleComplete(r)}
                title={r.status === 'completed' ? 'Mark as pending' : 'Mark as done'}
                disabled={!canEdit}
              >
                {r.status === 'completed' && (
                  <svg className={styles.checkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>

              {/* Body */}
              <div className={styles.reminderBody}>
                <div className={styles.reminderTitle}>
                  <span>{r.title}</span>
                  <span className={`${styles.badge} ${priorityClass(r.priority)}`}>{r.priority}</span>
                  {r.recurring && <span className={`${styles.badge} ${styles.badgeRecurring}`}>↻ {r.recurring}</span>}
                </div>
                {r.description && <div className={styles.reminderDesc}>{r.description}</div>}
                <div className={styles.reminderMeta}>
                  {r.due_date && (
                    <span className={`${styles.metaItem} ${isOverdue(r.due_date, r.status) ? styles.overdue : ''}`}>
                      <svg className={styles.metaIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                      {isOverdue(r.due_date, r.status) ? 'Overdue: ' : 'Due: '}{formatDate(r.due_date)}
                    </span>
                  )}
                  {r.remind_at && !r.reminder_sent && (
                    <span className={styles.metaItem}>
                      <svg className={styles.metaIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 10a6 6 0 0112 0c0 3 1.2 4.5 1.8 5.2A1 1 0 0119 17H5a1 1 0 01-.8-1.8C4.8 14.5 6 13 6 10z" /><path d="M10 19a2 2 0 004 0" /></svg>
                      Remind: {formatDateTime(r.remind_at)}
                    </span>
                  )}
                  {r.assignee && (
                    <span className={styles.metaItem}>
                      <svg className={styles.metaIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M5 20c1.4-3 4-5 7-5s5.6 2 7 5" /></svg>
                      {r.assignee.full_name || r.assignee.email}
                    </span>
                  )}
                  <span className={styles.metaItem}>
                    {formatDate(r.created_at)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              {(canEdit || canDelete) && (
                <div className={styles.reminderActions}>
                  {canEdit && (
                    <button className={styles.actionBtn} onClick={() => openEdit(r)}>Edit</button>
                  )}
                  {canDelete && (
                    deletingId === r.id ? (
                      <>
                        <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => handleDelete(r.id)}>Confirm</button>
                        <button className={styles.actionBtn} onClick={() => setDeletingId(null)}>Cancel</button>
                      </>
                    ) : (
                      <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => setDeletingId(r.id)}>Delete</button>
                    )
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>{editing ? 'Edit Reminder' : 'New Reminder'}</h3>
              <button className={styles.modalClose} onClick={() => setShowModal(false)}>×</button>
            </div>

            <div className={styles.modalBody}>
              {error && <div className={styles.error}>{error}</div>}

              <div className={styles.formGroup}>
                <label>Title *</label>
                <input type="text" value={fTitle} onChange={e => setFTitle(e.target.value)} placeholder="What needs to be done?" autoFocus />
              </div>

              <div className={styles.formGroup}>
                <label>Description</label>
                <textarea value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder="Optional details..." />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Priority</label>
                  <select value={fPriority} onChange={e => setFPriority(e.target.value as ReminderPriority)}>
                    {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {editing && (
                  <div className={styles.formGroup}>
                    <label>Status</label>
                    <select value={fStatus} onChange={e => setFStatus(e.target.value as ReminderStatus)}>
                      {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                )}
                {!editing && (
                  <div className={styles.formGroup}>
                    <label>Assign To</label>
                    <select value={fAssigned} onChange={e => setFAssigned(e.target.value)}>
                      <option value="">Myself</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {editing && (
                <div className={styles.formGroup}>
                  <label>Assign To</label>
                  <select value={fAssigned} onChange={e => setFAssigned(e.target.value)}>
                    <option value="">Unassigned (creator)</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
                  </select>
                </div>
              )}

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Due Date</label>
                  <input type="datetime-local" value={fDueDate} onChange={e => setFDueDate(e.target.value)} />
                </div>
                <div className={styles.formGroup}>
                  <label>Remind Me At</label>
                  <input type="datetime-local" value={fRemindAt} onChange={e => setFRemindAt(e.target.value)} />
                </div>
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Recurring</label>
                  <select value={fRecurring} onChange={e => setFRecurring(e.target.value as '' | ReminderRecurring)}>
                    {RECURRING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {fRecurring && (
                  <div className={styles.formGroup}>
                    <label>Recurring Until</label>
                    <input type="date" value={fRecurringEnd} onChange={e => setFRecurringEnd(e.target.value)} />
                  </div>
                )}
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
