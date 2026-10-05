'use client';

import { type CSSProperties, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import FleetIcon from '@/components/fleet/FleetIcon';
import { cancelInviteAction } from '@/lib/actions/invites';

export interface PendingInviteItem {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  status: 'pending' | 'declined';
  created_at: string;
}

/**
 * Invitations to people who already had a Rovora account — they join only once
 * they accept, so until then they live here rather than in the main list.
 * Declined ones stay visible for a while so the admin gets an answer.
 */
export default function PendingInvites({ invites }: { invites: PendingInviteItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [, startTransition] = useTransition();

  if (!invites.length) return null;

  const remove = (id: string) => {
    setError('');
    setBusyId(id);
    startTransition(async () => {
      const res = await cancelInviteAction(id);
      if (!res.ok) setError(res.error);
      setBusyId(null);
      router.refresh();
    });
  };

  return (
    <section style={st.card} aria-label="Pending invitations">
      <div style={st.head}>
        <FleetIcon name="bell" size={15} />
        <span style={{ fontWeight: 500, color: 'var(--text-1)' }}>Invitations</span>
        <span style={{ color: 'var(--text-3)' }}>· people who already use Rovora join once they accept</span>
      </div>
      {error && <div style={st.error}>{error}</div>}
      {invites.map((inv, i) => (
        <div key={inv.id} style={{ ...st.row, borderTop: i ? '1px solid var(--line-1)' : 'none' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={st.name}>{inv.full_name || inv.email}</div>
            <div style={st.sub}>
              {inv.full_name ? `${inv.email} · ` : ''}
              {inv.role} · invited {new Date(inv.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </div>
          </div>
          <span style={inv.status === 'declined' ? st.declined : st.waiting}>
            {inv.status === 'declined' ? 'Declined' : 'Waiting for them'}
          </span>
          <button
            type="button"
            className="fleetHover"
            style={st.btn}
            disabled={busyId === inv.id}
            onClick={() => remove(inv.id)}
          >
            {busyId === inv.id ? '…' : inv.status === 'declined' ? 'Dismiss' : 'Cancel'}
          </button>
        </div>
      ))}
    </section>
  );
}

const pill: CSSProperties = {
  flexShrink: 0,
  fontSize: 11.5,
  fontWeight: 500,
  padding: '3px 8px',
  borderRadius: 99,
  whiteSpace: 'nowrap',
};

const st: Record<string, CSSProperties> = {
  card: {
    background: 'var(--bg-1)',
    border: '1px solid var(--line-2)',
    borderRadius: 'var(--radius-lg)',
    padding: '4px 16px',
    marginBottom: 16,
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    padding: '10px 0',
    fontSize: 13,
    borderBottom: '1px solid var(--line-1)',
  },
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' },
  name: { fontSize: 13.5, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  sub: { fontSize: 12, color: 'var(--text-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  waiting: { ...pill, background: 'var(--warn-soft)', color: 'var(--warn)' },
  declined: { ...pill, background: 'var(--neg-soft)', color: 'var(--neg)' },
  btn: {
    flexShrink: 0,
    fontSize: 12.5,
    padding: '5px 10px',
    borderRadius: 8,
    border: '1px solid var(--line-2)',
    background: 'transparent',
    color: 'var(--text-2)',
    cursor: 'pointer',
  },
  error: { fontSize: 12.5, color: 'var(--neg)', padding: '8px 0 0' },
};
