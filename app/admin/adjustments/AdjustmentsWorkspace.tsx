'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { DriverAdjustment, AdjustmentType } from '@/lib/types/database';
import styles from './adjustments.module.css';

interface DriverBasic {
  id: string;
  full_name: string;
  status: string;
}

interface AdjustmentWithDriver extends DriverAdjustment {
  drivers: { id: string; full_name: string } | null;
}

interface AdjustmentsWorkspaceProps {
  drivers: DriverBasic[];
  adjustments: AdjustmentWithDriver[];
  isAdmin: boolean;
}

const ADJUSTMENT_TYPES: { value: AdjustmentType; label: string; icon: string }[] = [
  { value: 'expense', label: 'Expense', icon: '💸' },
  { value: 'bonus', label: 'Bonus', icon: '🎁' },
  { value: 'deduction', label: 'Deduction', icon: '➖' },
  { value: 'reimbursement', label: 'Reimbursement', icon: '💰' },
  { value: 'other', label: 'Other', icon: '📋' },
];

export default function AdjustmentsWorkspace({
  drivers,
  adjustments,
  isAdmin,
}: AdjustmentsWorkspaceProps) {
  const router = useRouter();
  
  // Filter state
  const [filterDriver, setFilterDriver] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterFromDate, setFilterFromDate] = useState<string>('');
  const [filterToDate, setFilterToDate] = useState<string>('');
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingAdjustment, setEditingAdjustment] = useState<AdjustmentWithDriver | null>(null);
  
  // Form state
  const [formDriverId, setFormDriverId] = useState('');
  const [formType, setFormType] = useState<AdjustmentType>('expense');
  const [formAmount, setFormAmount] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formNotes, setFormNotes] = useState('');
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtered adjustments
  const filteredAdjustments = useMemo(() => {
    return adjustments.filter(adj => {
      if (filterDriver && adj.driver_id !== filterDriver) return false;
      if (filterType && adj.type !== filterType) return false;
      if (filterFromDate && adj.date < filterFromDate) return false;
      if (filterToDate && adj.date > filterToDate) return false;
      return true;
    });
  }, [adjustments, filterDriver, filterType, filterFromDate, filterToDate]);

  // Summary calculations
  const summary = useMemo(() => {
    const result = {
      expense: 0,
      bonus: 0,
      deduction: 0,
      reimbursement: 0,
      other: 0,
      netBalance: 0,
    };
    
    filteredAdjustments.forEach(adj => {
      result[adj.type] += adj.amount;
      // Expenses and deductions are negative (driver owes), bonuses and reimbursements are positive (owed to driver)
      if (adj.type === 'expense' || adj.type === 'deduction') {
        result.netBalance -= adj.amount;
      } else if (adj.type === 'bonus' || adj.type === 'reimbursement') {
        result.netBalance += adj.amount;
      }
    });
    
    return result;
  }, [filteredAdjustments]);

  // Open modal for new adjustment
  const openNewModal = useCallback(() => {
    setEditingAdjustment(null);
    setFormDriverId('');
    setFormType('expense');
    setFormAmount('');
    setFormDescription('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormNotes('');
    setError(null);
    setShowModal(true);
  }, []);

  // Open modal for editing
  const openEditModal = useCallback((adjustment: AdjustmentWithDriver) => {
    setEditingAdjustment(adjustment);
    setFormDriverId(adjustment.driver_id);
    setFormType(adjustment.type);
    setFormAmount(adjustment.amount.toString());
    setFormDescription(adjustment.description);
    setFormDate(adjustment.date);
    setFormNotes(adjustment.notes || '');
    setError(null);
    setShowModal(true);
  }, []);

  // Close modal
  const closeModal = useCallback(() => {
    setShowModal(false);
    setEditingAdjustment(null);
    setError(null);
  }, []);

  // Save adjustment
  const handleSave = async () => {
    if (!formDriverId || !formAmount || !formDescription || !formDate) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        driver_id: formDriverId,
        type: formType,
        amount: parseFloat(formAmount),
        description: formDescription,
        date: formDate,
        notes: formNotes || undefined,
      };

      const url = editingAdjustment 
        ? `/api/adjustments/${editingAdjustment.id}` 
        : '/api/adjustments';
      const method = editingAdjustment ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      closeModal();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Delete adjustment
  const handleDelete = async (adjustmentId: string) => {
    if (!confirm('Are you sure you want to delete this adjustment?')) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/adjustments/${adjustmentId}`, { method: 'DELETE' });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Delete failed');
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setLoading(false);
    }
  };

  // Format currency
  const formatCurrency = (amount: number) => `€${amount.toFixed(2)}`;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Driver Adjustments</h2>
        {isAdmin && (
          <div className={styles.actions}>
            <button onClick={openNewModal} className="btn btn-primary">
              + Add Adjustment
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label>Driver</label>
          <select value={filterDriver} onChange={(e) => setFilterDriver(e.target.value)}>
            <option value="">All Drivers</option>
            {drivers.map(d => (
              <option key={d.id} value={d.id}>{d.full_name}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label>Type</label>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="">All Types</option>
            {ADJUSTMENT_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label>From Date</label>
          <input 
            type="date" 
            value={filterFromDate} 
            onChange={(e) => setFilterFromDate(e.target.value)} 
          />
        </div>
        <div className={styles.filterGroup}>
          <label>To Date</label>
          <input 
            type="date" 
            value={filterToDate} 
            onChange={(e) => setFilterToDate(e.target.value)} 
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className={styles.summaryCards}>
        <div className={`${styles.summaryCard} ${styles.expense}`}>
          <div className={styles.summaryLabel}>💸 Expenses</div>
          <div className={`${styles.summaryValue} ${styles.negative}`}>
            {formatCurrency(summary.expense)}
          </div>
        </div>
        <div className={`${styles.summaryCard} ${styles.bonus}`}>
          <div className={styles.summaryLabel}>🎁 Bonuses</div>
          <div className={`${styles.summaryValue} ${styles.positive}`}>
            {formatCurrency(summary.bonus)}
          </div>
        </div>
        <div className={`${styles.summaryCard} ${styles.deduction}`}>
          <div className={styles.summaryLabel}>➖ Deductions</div>
          <div className={`${styles.summaryValue} ${styles.negative}`}>
            {formatCurrency(summary.deduction)}
          </div>
        </div>
        <div className={`${styles.summaryCard} ${styles.reimbursement}`}>
          <div className={styles.summaryLabel}>💰 Reimbursements</div>
          <div className={`${styles.summaryValue} ${styles.positive}`}>
            {formatCurrency(summary.reimbursement)}
          </div>
        </div>
      </div>

      {/* Adjustments Table */}
      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Driver</th>
                <th>Type</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Notes</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredAdjustments.length > 0 ? (
                filteredAdjustments.map(adj => {
                  const isNegative = adj.type === 'expense' || adj.type === 'deduction';
                  return (
                    <tr key={adj.id}>
                      <td>{adj.date}</td>
                      <td>
                        <strong>{adj.drivers?.full_name || 'Unknown'}</strong>
                      </td>
                      <td>
                        <span className={`${styles.typeIndicator} ${styles[adj.type]}`}>
                          {ADJUSTMENT_TYPES.find(t => t.value === adj.type)?.icon}{' '}
                          {ADJUSTMENT_TYPES.find(t => t.value === adj.type)?.label}
                        </span>
                      </td>
                      <td>{adj.description}</td>
                      <td className={`${styles.amountCell} ${isNegative ? styles.negative : styles.positive}`}>
                        {isNegative ? '-' : '+'}{formatCurrency(adj.amount)}
                      </td>
                      <td>{adj.notes || '-'}</td>
                      {isAdmin && (
                        <td>
                          <div className={styles.actions}>
                            <button 
                              onClick={() => openEditModal(adj)} 
                              className="btn btn-sm btn-outline"
                            >
                              Edit
                            </button>
                            <button 
                              onClick={() => handleDelete(adj.id)} 
                              className="btn btn-sm btn-danger"
                              disabled={loading}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="text-center text-muted">
                    No adjustments found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className={styles.modal} onClick={closeModal}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>{editingAdjustment ? 'Edit Adjustment' : 'Add Adjustment'}</h3>
              <button className={styles.closeBtn} onClick={closeModal}>&times;</button>
            </div>

            {error && (
              <div className="alert alert-danger" style={{ marginBottom: 'var(--spacing-md)' }}>
                {error}
              </div>
            )}

            <div className={styles.formGroup}>
              <label>Driver *</label>
              <select 
                value={formDriverId} 
                onChange={(e) => setFormDriverId(e.target.value)}
                disabled={!!editingAdjustment}
              >
                <option value="">Select a driver</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.full_name}</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Type *</label>
              <select value={formType} onChange={(e) => setFormType(e.target.value as AdjustmentType)}>
                {ADJUSTMENT_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label>Amount (€) *</label>
              <input 
                type="number" 
                step="0.01" 
                min="0"
                value={formAmount} 
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Description *</label>
              <input 
                type="text" 
                value={formDescription} 
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="e.g., Fuel expense, Performance bonus"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Date *</label>
              <input 
                type="date" 
                value={formDate} 
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Notes</label>
              <textarea 
                value={formNotes} 
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Optional additional notes..."
              />
            </div>

            <div className={styles.formActions}>
              <button onClick={closeModal} className="btn btn-secondary" disabled={loading}>
                Cancel
              </button>
              <button onClick={handleSave} className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : (editingAdjustment ? 'Update' : 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
