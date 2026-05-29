'use client';

import { useState } from 'react';
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
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span style={{ fontSize: '14px', color: 'var(--danger)' }}>
          {isDualRole ? `Remove staff access for ${staffName}?` : `Delete ${staffName}?`}
        </span>
        <button
          className="btn btn-sm btn-danger"
          onClick={handleDelete}
          disabled={loading}
        >
          {loading ? 'Deleting...' : 'Yes'}
        </button>
        <button
          className="btn btn-sm btn-secondary"
          onClick={() => setShowConfirm(false)}
          disabled={loading}
        >
          No
        </button>
      </div>
    );
  }

  return (
    <button
      className="btn btn-danger"
      onClick={() => setShowConfirm(true)}
    >
      {isDualRole ? 'Remove Staff Access' : 'Delete'}
    </button>
  );
}
