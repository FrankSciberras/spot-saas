'use client';

import { type CSSProperties, useState } from 'react';
import { useRouter } from 'next/navigation';

interface DeleteStaffButtonProps {
  staffId: string;
  staffName: string;
  isDualRole?: boolean;
}

export default function DeleteStaffButton({ staffId, staffName, isDualRole = false }: DeleteStaffButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${staffId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete staff member');
      }

      router.push('/fleet/staff');
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete staff member');
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

  if (showConfirm) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, color: 'var(--text-1)' }}>
          {isDualRole
            ? `Remove ${staffName}’s staff access? They stay a driver.`
            : `Remove ${staffName} from your fleet?`}
        </span>
        <button type="button" style={{ ...btn, ...danger }} onClick={handleDelete} disabled={loading}>
          {loading ? 'Removing…' : 'Yes, remove'}
        </button>
        <button type="button" style={btn} onClick={() => setShowConfirm(false)} disabled={loading}>
          Cancel
        </button>
      </div>
    );
  }

  // Removes them from THIS fleet only (/api/users/:id) — their account and any
  // other fleets are untouched unless this was their last one.
  return (
    <button type="button" style={{ ...btn, ...dangerOutline }} onClick={() => setShowConfirm(true)}>
      {isDualRole ? 'Remove staff access' : 'Remove from fleet'}
    </button>
  );
}

// Fleet design tokens, so it sits with the page's other chip buttons.
const btn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '6px 12px',
  borderRadius: 7,
  fontSize: 13,
  fontWeight: 500,
  border: '1px solid var(--line-2)',
  background: 'var(--bg-1)',
  color: 'var(--text-1)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const dangerOutline: CSSProperties = { color: 'var(--neg)', borderColor: 'var(--neg-soft)' };
const danger: CSSProperties = { background: 'var(--neg)', borderColor: 'var(--neg)', color: '#fff' };
