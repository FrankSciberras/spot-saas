'use client';

import { useState } from 'react';
import styles from './AdminForms.module.css';

interface ArchiveDriverButtonProps {
  driverId: string;
  driverName: string;
  /** Already archived → this becomes the Restore button. */
  archived: boolean;
  /** Has a Rovora login (otherwise there's no access to take away). */
  hasLogin: boolean;
}

/**
 * Archive a driver who has left (they lose access, the fleet keeps their
 * shifts, earnings and stats), or restore an archived one.
 */
export default function ArchiveDriverButton({ driverId, driverName, archived, hasLogin }: ArchiveDriverButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/drivers/${driverId}/archive`, { method: archived ? 'DELETE' : 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || (archived ? 'Could not restore this driver' : 'Could not archive this driver'));
      // Full reload: the whole profile (status, vehicles, banner) changes.
      window.location.reload();
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (!showConfirm) {
    return (
      <button type="button" className="btn btn-secondary" onClick={() => setShowConfirm(true)}>
        {archived ? 'Restore driver' : 'Archive driver'}
      </button>
    );
  }

  return (
    <div className={styles.deleteConfirm} style={{ borderColor: 'var(--line-2)' }}>
      <h4 style={{ color: 'var(--text-1)' }}>{archived ? 'Restore this driver?' : 'Archive this driver?'}</h4>
      {archived ? (
        <p>
          <strong>{driverName}</strong> goes back on your active drivers list
          {hasLogin ? ' and can sign in to the driver app and portal again' : ''}. They count toward your
          plan&apos;s driver limit again. Re-assign a vehicle afterwards if they need one.
        </p>
      ) : (
        <p>
          <strong>{driverName}</strong>
          {hasLogin ? ' will no longer be able to sign in to the driver app or portal' : ' moves to your archived drivers'}.
          Any open shift is ended and their vehicles are freed up. Their shifts, earnings, settlements and
          stats stay in your dashboards and reports, and they stop counting toward your plan&apos;s driver
          limit. You can restore them at any time.
        </p>
      )}
      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 'var(--spacing-md)' }}>
          {error}
        </div>
      )}
      <div className={styles.deleteActions}>
        <button type="button" className="btn btn-secondary" onClick={() => setShowConfirm(false)} disabled={loading}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={run} disabled={loading}>
          {loading ? (archived ? 'Restoring…' : 'Archiving…') : archived ? 'Yes, restore' : 'Yes, archive'}
        </button>
      </div>
    </div>
  );
}
