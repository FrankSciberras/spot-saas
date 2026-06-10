'use client';

import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import FleetIcon from './FleetIcon';

interface CreatedDriver {
  id: string;
  full_name: string;
  status: string;
  employment_type: string | null;
}

interface AddDriverModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the freshly-created driver once the API responds. */
  onCreated?: (driver: CreatedDriver) => void;
}

/**
 * Lightweight "quick add a driver" modal. Mirrors the create flow that the full
 * /fleet/drivers/new page uses — invite the driver's user account first, then
 * create the linked driver record — so admins can add a driver without leaving
 * the current page (e.g. mid-settlement). Documents & vehicle assignment still
 * live on the full driver page.
 *
 * Styled entirely from the fleet theme tokens (it renders inside .fleetCanvas),
 * so it tracks the dark/light toggle. Animations live in fleet-theme.css.
 */
export default function AddDriverModal({ open, onClose, onCreated }: AddDriverModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [employment, setEmployment] = useState('full_time');
  const [status, setStatus] = useState('active');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Reset + focus when opened; close on Escape.
  useEffect(() => {
    if (!open) return;
    setError(null);
    const t = setTimeout(() => firstFieldRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); };
  }, [open, loading, onClose]);

  const reset = () => {
    setFullName(''); setEmail(''); setPhone('');
    setEmployment('full_time'); setStatus('active'); setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Full name is required.');
      return;
    }
    if (!email.trim()) {
      setError('Email is required — the driver is invited to set their own password.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 1. Invite / resolve the user account for this driver.
      const inviteRes = await fetch('/api/members/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), full_name: fullName.trim(), role: 'driver' }),
      });
      const inviteData = await inviteRes.json();
      if (!inviteRes.ok) throw new Error(inviteData.error || 'Failed to invite driver');
      const userId: string | undefined = inviteData?.data?.userId;
      if (!userId) throw new Error('Could not resolve the invited user');

      // 2. Create the linked driver record.
      const res = await fetch('/api/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          full_name: fullName.trim(),
          phone: phone.trim() || undefined,
          employment_type: employment,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create driver');

      onCreated?.(data.data);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      style={st.overlay}
      className="fleetModalOverlay"
      onMouseDown={() => { if (!loading) onClose(); }}
    >
      <div
        style={st.modal}
        className="fleetModalCard"
        role="dialog"
        aria-modal="true"
        aria-label="Add driver"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={st.header}>
          <div style={st.headerIco}>
            <FleetIcon name="driver" size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={st.title}>Add a driver</h3>
            <p style={st.subtitle}>Create a driver — you can add documents &amp; vehicle later.</p>
          </div>
          <button type="button" style={st.closeBtn} className="fleetHover" onClick={onClose} aria-label="Close">
            <FleetIcon name="close" size={16} stroke={2} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={st.body}>
          {error && <div style={st.error}>{error}</div>}

          <div style={st.field}>
            <label style={st.label} htmlFor="qad-name">Full name *</label>
            <input
              id="qad-name"
              ref={firstFieldRef}
              style={st.input}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. A. Murphy"
              disabled={loading}
              required
            />
          </div>

          <p style={st.note}>
            Need documents, license details or a vehicle? Use the full{' '}
            <a href="/fleet/drivers/new" style={{ color: 'var(--accent)' }}>driver page</a>.
          </p>

          <div style={st.field}>
            <label style={st.label} htmlFor="qad-email">Email *</label>
            <input id="qad-email" type="email" style={st.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@email.com" disabled={loading} required />
            <span style={st.hint}>We&rsquo;ll email an invite to set their password.</span>
          </div>

          <div style={st.grid2}>
            <div style={st.field}>
              <label style={st.label} htmlFor="qad-phone">Phone</label>
              <input id="qad-phone" type="tel" style={st.input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+356 …" disabled={loading} />
            </div>
            <div style={st.field}>
              <label style={st.label} htmlFor="qad-employment">Employment</label>
              <select id="qad-employment" style={st.input} value={employment} onChange={(e) => setEmployment(e.target.value)} disabled={loading}>
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
              </select>
            </div>
          </div>

          <div style={st.field}>
            <label style={st.label} htmlFor="qad-status">Status</label>
            <select id="qad-status" style={st.input} value={status} onChange={(e) => setStatus(e.target.value)} disabled={loading}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div style={st.actions}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !fullName.trim()}>
              {loading ? 'Creating…' : 'Create driver'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    background: 'rgba(4, 6, 12, 0.55)',
    backdropFilter: 'blur(3px)',
  },
  modal: {
    width: '100%',
    maxWidth: 460,
    background: 'var(--bg-1)',
    border: '1px solid var(--line-2)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-elevated)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    padding: '18px 18px 14px',
    borderBottom: '1px solid var(--line-1)',
  },
  headerIco: {
    flexShrink: 0,
    width: 38,
    height: 38,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 10,
    background: 'var(--accent-soft)',
    border: '1px solid var(--accent-line)',
    color: 'var(--accent)',
  },
  title: { margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-1)' },
  subtitle: { margin: '3px 0 0', fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.4 },
  closeBtn: {
    flexShrink: 0,
    width: 30,
    height: 30,
    display: 'grid',
    placeItems: 'center',
    background: 'transparent',
    border: '1px solid var(--line-2)',
    borderRadius: 8,
    color: 'var(--text-2)',
    cursor: 'pointer',
  },
  body: { padding: 18, display: 'flex', flexDirection: 'column', gap: 14 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  label: { fontSize: 12, fontWeight: 500, color: 'var(--text-2)' },
  hint: { fontSize: 11, color: 'var(--text-3)' },
  note: { margin: '-2px 0 2px', fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.45 },
  input: {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--bg-0)',
    border: '1px solid var(--line-2)',
    borderRadius: 9,
    color: 'var(--text-1)',
    fontSize: 13.5,
    fontFamily: 'inherit',
    outline: 'none',
  },
  error: {
    padding: '10px 12px',
    borderRadius: 9,
    background: 'var(--neg-soft)',
    border: '1px solid var(--neg)',
    color: 'var(--neg)',
    fontSize: 13,
  },
  actions: { marginTop: 4, display: 'flex', gap: 10, justifyContent: 'flex-end' },
};
