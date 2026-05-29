'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './AdminForms.module.css';

interface DeleteDriverButtonProps {
  driverId: string;
  driverName: string;
}

export default function DeleteDriverButton({ driverId, driverName }: DeleteDriverButtonProps) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/drivers/${driverId}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete driver');
      }

      router.push('/fleet/drivers');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  if (!showConfirm) {
    return (
      <button 
        type="button"
        className="btn btn-danger"
        onClick={() => setShowConfirm(true)}
      >
        Delete
      </button>
    );
  }

  return (
    <div className={styles.deleteConfirm}>
      <h4>Confirm Deletion</h4>
      <p>
        Are you sure you want to delete <strong>{driverName}</strong>? 
        This action cannot be undone. All associated data including shifts will be permanently removed.
      </p>
      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 'var(--spacing-md)' }}>
          {error}
        </div>
      )}
      <div className={styles.deleteActions}>
        <button 
          type="button"
          className="btn btn-secondary"
          onClick={() => setShowConfirm(false)}
          disabled={loading}
        >
          Cancel
        </button>
        <button 
          type="button"
          className="btn btn-danger"
          onClick={handleDelete}
          disabled={loading}
        >
          {loading ? 'Deleting...' : 'Yes, Delete Driver'}
        </button>
      </div>
    </div>
  );
}
