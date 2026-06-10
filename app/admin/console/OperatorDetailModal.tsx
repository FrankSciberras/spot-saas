'use client';

// =============================================================================
// OPERATOR DETAIL MODAL (platform-admin) — edit a fleet, manage members, danger.
// =============================================================================
// Opened from the operators table. Loads detail via getOperatorDetailAction and
// lets the admin rename/re-slug, set a trial end date, add/remove members and
// change their roles, and suspend / cancel / delete the operator.
// =============================================================================

import { useCallback, useEffect, useState, useTransition, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import FleetIcon from '@/components/fleet/FleetIcon';
import {
  getOperatorDetailAction,
  updateOperatorAction,
  setOperatorTrialEndAction,
  addOperatorMemberAction,
  removeOperatorMemberAction,
  setOperatorMemberRoleAction,
  setOperatorStatusAction,
  deleteOperatorAction,
  type OperatorDetail,
} from '@/lib/actions/platform-operators';

const Icon = FleetIcon;

const inp: CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--bg-2)',
  color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
};
const lbl: CSSProperties = { fontSize: 11, color: 'var(--text-3)', marginBottom: 4, display: 'block' };
const btn: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', background: 'var(--accent)',
  border: '1px solid var(--accent)', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
const ghost: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', background: 'var(--bg-1)',
  border: '1px solid var(--line-2)', borderRadius: 8, color: 'var(--text-2)', fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer',
};
const sectionTitle: CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 10 };
const rolePill = (role: string): CSSProperties => ({
  fontSize: 10.5, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.03em', padding: '2px 8px', borderRadius: 100,
  color: role === 'admin' ? 'var(--accent)' : role === 'staff' ? 'var(--text-2)' : 'var(--text-3)',
  background: role === 'admin' ? 'var(--accent-soft)' : 'var(--bg-3)',
});

/** ISO → yyyy-mm-dd for <input type=date>. */
function toDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export default function OperatorDetailModal({ operatorId, onClose }: { operatorId: string; onClose: () => void }) {
  const router = useRouter();
  const [detail, setDetail] = useState<OperatorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  // Local editable fields.
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [trialDate, setTrialDate] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'staff'>('staff');

  const load = useCallback(async () => {
    const r = await getOperatorDetailAction(operatorId);
    if (r.error || !r.detail) { setError(r.error ?? 'Could not load operator.'); setLoading(false); return; }
    setDetail(r.detail);
    setName(r.detail.name);
    setSlug(r.detail.slug);
    setTrialDate(toDateInput(r.detail.trialEndsAt));
    setLoading(false);
  }, [operatorId]);

  useEffect(() => { load(); }, [load]);

  /** Run a mutation, then refresh the modal + the console behind it. */
  const run = (fn: () => Promise<{ error?: string; ok?: boolean }>) => {
    setError('');
    startTransition(async () => {
      const r = await fn();
      if (r?.error) { setError(r.error); return; }
      await load();
      router.refresh();
    });
  };

  const remove = (userId: string, email: string) => {
    if (!window.confirm(`Remove ${email} from this operator?`)) return;
    run(() => removeOperatorMemberAction(operatorId, userId));
  };
  const del = () => {
    if (!detail) return;
    if (!window.confirm(`Permanently delete "${detail.name}" and ALL its data (drivers, vehicles, members)? This cannot be undone.`)) return;
    setError('');
    startTransition(async () => {
      const r = await deleteOperatorAction(operatorId);
      if (r?.error) { setError(r.error); return; }
      router.refresh();
      onClose();
    });
  };

  const suspended = detail?.status === 'suspended';
  const cancelled = detail?.status === 'cancelled';

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '6vh 16px 16px', overflowY: 'auto' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 520, background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 14, boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid var(--line-1)' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>
            {detail ? `Manage ${detail.name}` : 'Manage operator'}
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', display: 'flex' }} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>Loading…</div>
        ) : !detail ? (
          <div style={{ padding: 24, fontSize: 13, color: 'var(--neg)' }}>{error || 'Operator not found.'}</div>
        ) : (
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 22 }}>
            {error && <div style={{ fontSize: 12.5, color: 'var(--neg)' }}>{error}</div>}

            {/* Details */}
            <div>
              <div style={sectionTitle}>Details</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 2, minWidth: 160 }}>
                  <label style={lbl}>Name</label>
                  <input style={inp} value={name} disabled={isPending} onChange={(e) => setName(e.target.value)} />
                </div>
                <div style={{ flex: 2, minWidth: 160 }}>
                  <label style={lbl}>Slug</label>
                  <input style={inp} value={slug} disabled={isPending} onChange={(e) => setSlug(e.target.value)} />
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <button
                  style={{ ...btn, opacity: isPending || (name === detail.name && slug === detail.slug) ? 0.5 : 1 }}
                  disabled={isPending || (name === detail.name && slug === detail.slug)}
                  onClick={() => run(() => updateOperatorAction(operatorId, { name, slug }))}
                >Save details</button>
              </div>
            </div>

            {/* Trial */}
            <div>
              <div style={sectionTitle}>Trial</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={lbl}>Trial end date</label>
                  <input style={inp} type="date" value={trialDate} disabled={isPending} onChange={(e) => setTrialDate(e.target.value)} />
                </div>
                <button style={ghost} disabled={isPending} onClick={() => run(() => setOperatorTrialEndAction(operatorId, trialDate || null))}>
                  Set trial
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 6 }}>
                Puts the fleet on the trial plan until this date. Current plan: <strong style={{ color: 'var(--text-2)' }}>{detail.plan}</strong>.
              </div>
            </div>

            {/* Members */}
            <div>
              <div style={sectionTitle}>Members</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {detail.members.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No members yet.</div>}
                {detail.members.map((m) => (
                  <div key={m.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--line-1)', borderRadius: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.fullName || m.email}</div>
                      {m.fullName && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{m.email}</div>}
                    </div>
                    <span style={rolePill(m.role)}>{m.role}</span>
                    {(m.role === 'admin' || m.role === 'staff') && (
                      <button
                        style={ghost}
                        disabled={isPending}
                        title={m.role === 'admin' ? 'Make staff' : 'Make admin'}
                        onClick={() => run(() => setOperatorMemberRoleAction(operatorId, m.userId, m.role === 'admin' ? 'staff' : 'admin'))}
                      >{m.role === 'admin' ? '→ Staff' : '→ Admin'}</button>
                    )}
                    <button
                      style={{ ...ghost, color: 'var(--neg)', borderColor: 'var(--neg-soft)' }}
                      disabled={isPending}
                      onClick={() => remove(m.userId, m.email)}
                    >Remove</button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={lbl}>Add member by email</label>
                  <input style={inp} type="email" placeholder="person@fleet.com" value={newEmail} disabled={isPending} onChange={(e) => setNewEmail(e.target.value)} />
                </div>
                <select style={{ ...inp, width: 'auto', cursor: 'pointer' }} value={newRole} disabled={isPending} onChange={(e) => setNewRole(e.target.value as 'admin' | 'staff')}>
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  style={{ ...btn, opacity: isPending || !newEmail.trim() ? 0.5 : 1 }}
                  disabled={isPending || !newEmail.trim()}
                  onClick={() => run(async () => {
                    const r = await addOperatorMemberAction(operatorId, newEmail, newRole);
                    if (!r.error) setNewEmail('');
                    return r;
                  })}
                >Add</button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 6 }}>
                Existing accounts are attached immediately. New emails are sent an invite.
              </div>
            </div>

            {/* Danger zone */}
            <div style={{ borderTop: '1px solid var(--line-1)', paddingTop: 16 }}>
              <div style={sectionTitle}>Account</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {suspended || cancelled ? (
                  <button style={ghost} disabled={isPending} onClick={() => run(() => setOperatorStatusAction(operatorId, 'active'))}>Reactivate</button>
                ) : (
                  <button style={ghost} disabled={isPending} onClick={() => run(() => setOperatorStatusAction(operatorId, 'suspended'))}>Suspend</button>
                )}
                {!cancelled && (
                  <button style={{ ...ghost, color: 'var(--warn)', borderColor: 'var(--warn-soft)' }} disabled={isPending} onClick={() => run(() => setOperatorStatusAction(operatorId, 'cancelled'))}>Cancel account</button>
                )}
                <button style={{ ...ghost, color: 'var(--neg)', borderColor: 'var(--neg-soft)', marginLeft: 'auto' }} disabled={isPending} onClick={del}>Delete permanently</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
