'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './RostersList.module.css';

interface Roster {
  id: string;
  title: string;
  week_start: string;
  week_end: string;
  status: string;
  notes: string | null;
  created_at: string;
  published_at: string | null;
}

interface RostersListProps {
  rosters: Roster[];
}

export default function RostersList({ rosters }: RostersListProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === rosters.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rosters.map(r => r.id)));
    }
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/rosters/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete rosters');
      }

      setSelectedIds(new Set());
      setShowConfirm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const someSelected = selectedIds.size > 0;

  return (
    <div className={styles.wrapper}>
      {/* Bulk Actions Bar */}
      {someSelected && (
        <div className={styles.bulkActions}>
          <div className={styles.selectControls}>
            <button
              type="button"
              className={styles.selectAllBtn}
              onClick={toggleSelectAll}
            >
              {selectedIds.size === rosters.length ? 'Deselect All' : 'Select All'}
            </button>
            <span className={styles.selectedCount}>
              {selectedIds.size} roster{selectedIds.size !== 1 ? 's' : ''} selected
            </span>
          </div>
          <button
            type="button"
            className={styles.deleteBtn}
            onClick={() => setShowConfirm(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
            Delete Selected
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showConfirm && (
        <div className={styles.modalOverlay} onClick={() => !loading && setShowConfirm(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3>Confirm Deletion</h3>
            <p>
              Are you sure you want to delete <strong>{selectedIds.size}</strong> roster{selectedIds.size !== 1 ? 's' : ''}? 
              This will also delete all associated roster entries. This action cannot be undone.
            </p>
            {error && (
              <div className={styles.error}>{error}</div>
            )}
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setShowConfirm(false)}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmDeleteBtn}
                onClick={handleDelete}
                disabled={loading}
              >
                {loading ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Roster Grid */}
      <div className={styles.rosterGrid}>
        {rosters.map((roster) => (
          <div 
            key={roster.id} 
            className={`${styles.rosterCard} ${selectedIds.has(roster.id) ? styles.selected : ''}`}
          >
            <div className={styles.cardCheckbox} onClick={(e) => toggleSelect(roster.id, e)}>
              <input
                type="checkbox"
                checked={selectedIds.has(roster.id)}
                onChange={() => {}}
              />
            </div>
            <Link href={`/admin/rosters/${roster.id}`} className={styles.cardContent}>
              <div className={styles.rosterHeader}>
                <h3 className={styles.rosterTitle}>{roster.title}</h3>
                <span className={`${styles.statusBadge} ${styles[roster.status]}`}>
                  {roster.status}
                </span>
              </div>
              <div className={styles.rosterDates}>
                {formatDate(roster.week_start)} - {formatDate(roster.week_end)}
              </div>
              {roster.notes && (
                <p className={styles.rosterNotes}>{roster.notes}</p>
              )}
              <div className={styles.rosterMeta}>
                <span>
                  Created {new Date(roster.created_at).toLocaleDateString('en-GB')}
                </span>
                {roster.published_at && (
                  <span>
                    Published {new Date(roster.published_at).toLocaleDateString('en-GB')}
                  </span>
                )}
              </div>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
