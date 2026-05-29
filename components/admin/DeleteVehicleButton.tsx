'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './AdminForms.module.css';

interface DeleteVehicleButtonProps {
  vehicleId: string;
  vehicleReg: string;
}

export default function DeleteVehicleButton({ vehicleId, vehicleReg }: DeleteVehicleButtonProps) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/vehicles/${vehicleId}`, {
        method: 'DELETE',
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete vehicle');
      }

      router.push('/fleet/vehicles');
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
        Are you sure you want to delete vehicle <strong>{vehicleReg}</strong>? 
        This action cannot be undone. All associated shift records will be affected.
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
          {loading ? 'Deleting...' : 'Yes, Delete Vehicle'}
        </button>
      </div>
    </div>
  );
}
