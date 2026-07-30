'use client';

import { type CSSProperties, type ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import FleetIcon from './FleetIcon';

interface DeleteRecordButtonProps {
  /** API endpoint to DELETE, e.g. `/api/vehicles/abc`. */
  endpoint: string;
  /** Where to send the user once the record is gone. */
  redirectTo: string;
  /** Dialog heading, e.g. "Delete vehicle?". */
  title: string;
  /** Dialog body copy — explain what else is affected. */
  body: ReactNode;
  /** Label on the confirm button, e.g. "Delete vehicle". */
  confirmLabel: string;
  /** Label on the trigger button. Defaults to "Delete". */
  label?: string;
}

/**
 * Ghost-danger delete trigger + confirmation modal, styled with the fleet
 * tokens. The trigger stays quiet (it only turns red on hover) so destructive
 * actions don't shout from the top of every detail page, and the confirmation
 * lives in an overlay instead of expanding inline and shoving the layout down.
 */
export default function DeleteRecordButton({
  endpoint,
  redirectTo,
  title,
  body,
  confirmLabel,
  label = 'Delete',
}: DeleteRecordButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading]);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        style={{ ...st.trigger, ...(hover ? st.triggerHover : {}) }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => setOpen(true)}
      >
        <FleetIcon name="trash" size={14} />
        {label}
      </button>

      {open && (
        <div
          style={st.overlay}
          className="fleetModalOverlay"
          onMouseDown={() => { if (!loading) setOpen(false); }}
        >
          <div
            style={st.modal}
            className="fleetModalCard"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={st.header}>
              <div style={st.headerIco}><FleetIcon name="warning" size={18} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={st.title}>{title}</h3>
                <p style={st.subtitle}>This can&apos;t be undone.</p>
              </div>
              <button
                type="button"
                style={st.closeBtn}
                className="fleetHover"
                onClick={() => { if (!loading) setOpen(false); }}
                aria-label="Close"
              >
                <FleetIcon name="close" size={16} stroke={2} />
              </button>
            </div>

            <div style={st.body}>
              {error && <div style={st.error}>{error}</div>}
              <p style={st.copy}>{body}</p>
              <div style={st.actions}>
                <button type="button" style={st.cancelBtn} className="fleetHover" onClick={() => setOpen(false)} disabled={loading}>
                  Cancel
                </button>
                <button type="button" style={st.confirmBtn} className="fleetHover" onClick={handleDelete} disabled={loading}>
                  {loading ? 'Deleting…' : confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const st: Record<string, CSSProperties> = {
  trigger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 13px',
    background: 'transparent',
    border: '1px solid var(--line-2)',
    borderRadius: 7,
    color: 'var(--text-3)',
    fontSize: 13,
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'color 0.15s, border-color 0.15s, background 0.15s',
  },
  triggerHover: {
    color: 'var(--neg)',
    borderColor: 'var(--neg)',
    background: 'var(--neg-soft)',
  },
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
    maxWidth: 420,
    background: 'var(--bg-1)',
    border: '1px solid var(--line-2)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
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
    background: 'var(--neg-soft)',
    border: '1px solid var(--neg)',
    color: 'var(--neg)',
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
  copy: { margin: 0, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 },
  error: {
    padding: '10px 12px',
    borderRadius: 9,
    background: 'var(--neg-soft)',
    border: '1px solid var(--neg)',
    color: 'var(--neg)',
    fontSize: 13,
  },
  actions: { marginTop: 2, display: 'flex', gap: 10, justifyContent: 'flex-end' },
  cancelBtn: {
    padding: '8px 14px',
    background: 'var(--bg-1)',
    border: '1px solid var(--line-2)',
    borderRadius: 7,
    color: 'var(--text-1)',
    fontSize: 13,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  confirmBtn: {
    padding: '8px 14px',
    background: 'var(--neg)',
    border: 'none',
    borderRadius: 7,
    color: '#fff',
    fontSize: 13,
    fontWeight: 500,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
};
