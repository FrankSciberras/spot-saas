'use client';

// =============================================================================
// ADD OPERATOR MODAL (platform-admin) — create a new fleet from /admin.
// =============================================================================
// Creates an organization on a fresh trial (or a chosen package) and optionally
// attaches/invites an owner by email. On success it refreshes the console so the
// new operator appears in the list + metrics.
// =============================================================================

import { useState, useTransition, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import FleetIcon from '@/components/fleet/FleetIcon';
import { createOperatorAction } from '@/lib/actions/platform-operators';
import { TRIAL_DAYS } from '@/lib/billing/plans';
import type { PlanMeta } from './types';

const Icon = FleetIcon;

const inp: CSSProperties = {
  padding: '9px 11px', borderRadius: 8, border: '1px solid var(--line-2)', background: 'var(--bg-2)',
  color: 'var(--text-1)', fontSize: 13, fontFamily: 'inherit', outline: 'none', width: '100%',
};
const lbl: CSSProperties = { fontSize: 11.5, color: 'var(--text-3)', marginBottom: 5, display: 'block' };

export default function AddOperatorModal({
  meta,
  assignable,
  onClose,
}: {
  meta: Record<string, PlanMeta>;
  assignable: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [plan, setPlan] = useState('trial');
  const [trialDays, setTrialDays] = useState(String(TRIAL_DAYS));
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    if (!name.trim()) { setError('Give the operator a name.'); return; }
    setError('');
    startTransition(async () => {
      const r = await createOperatorAction({
        name,
        plan,
        trialDays: plan === 'trial' ? Number(trialDays) || TRIAL_DAYS : undefined,
        ownerEmail: ownerEmail.trim() || undefined,
      });
      if (r.error) { setError(r.error); return; }
      if (r.warning) window.alert(r.warning);
      router.refresh();
      onClose();
    });
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '8vh 16px 16px', overflowY: 'auto' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 460, background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 14, boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid var(--line-1)' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>Add operator</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', display: 'flex' }} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={lbl}>Fleet name *</label>
            <input style={inp} value={name} placeholder="e.g. Acme Cabs" autoFocus disabled={isPending} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <label style={lbl}>Owner email (optional)</label>
            <input style={inp} type="email" value={ownerEmail} placeholder="owner@acme.com" disabled={isPending} onChange={(e) => setOwnerEmail(e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 5 }}>
              Existing accounts are attached as fleet admin. New emails are sent an invite.
            </div>
          </div>

          <div>
            <label style={lbl}>Plan</label>
            <select style={{ ...inp, cursor: 'pointer' }} value={plan} disabled={isPending} onChange={(e) => setPlan(e.target.value)}>
              {assignable.map((key) => (
                <option key={key} value={key}>{meta[key]?.label ?? key}</option>
              ))}
            </select>
          </div>

          {plan === 'trial' && (
            <div>
              <label style={lbl}>Trial length (days)</label>
              <input style={inp} type="number" min={1} value={trialDays} disabled={isPending} onChange={(e) => setTrialDays(e.target.value)} />
            </div>
          )}

          {error && <div style={{ fontSize: 12.5, color: 'var(--neg)' }}>{error}</div>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 18px', borderTop: '1px solid var(--line-1)' }}>
          <button
            onClick={onClose}
            disabled={isPending}
            style={{ padding: '8px 14px', background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 8, color: 'var(--text-2)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}
          >Cancel</button>
          <button
            onClick={submit}
            disabled={isPending || !name.trim()}
            style={{ padding: '8px 14px', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', opacity: isPending || !name.trim() ? 0.6 : 1 }}
          >{isPending ? 'Creating…' : 'Create operator'}</button>
        </div>
      </div>
    </div>
  );
}
