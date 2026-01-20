'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { WeeklyBookkeeping } from '@/lib/types/database';
import styles from './earnings.module.css';

interface SettlementPeriod {
  week_start: string;
  week_end: string;
  week_label: string;
  period_name: string | null;
}

interface EarningsWorkspaceProps {
  entries: WeeklyBookkeeping[];
  settlementPeriods: SettlementPeriod[];
}

function formatCurrency(value: number): string {
  return `€${value.toFixed(2)}`;
}

function formatDateDisplay(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function formatDateInput(dateStr: string): string {
  return dateStr.split('T')[0];
}

export default function EarningsWorkspace({ entries, settlementPeriods }: EarningsWorkspaceProps) {
  const router = useRouter();
  
  // Selected period
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(
    entries.length > 0 ? `${entries[0].week_start}_${entries[0].week_end}` : null
  );
  
  // New period form state
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newWeekStart, setNewWeekStart] = useState('');
  const [newWeekEnd, setNewWeekEnd] = useState('');
  const [newWeekLabel, setNewWeekLabel] = useState('');
  const [newPeriodName, setNewPeriodName] = useState('');
  
  // Form state
  const [formData, setFormData] = useState({
    uber_earnings: '',
    bolt_earnings: '',
    ecabs_earnings: '',
    other_earnings: '',
    employees: '',
    repairs: '',
    insurance: '',
    investments: '',
    vat: '',
    rent: '',
    employee_tax: '',
    other_expenses: '',
    notes: '',
  });
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Map entries by period key
  const entriesMap = useMemo(() => {
    const map = new Map<string, WeeklyBookkeeping>();
    entries.forEach(e => {
      map.set(`${e.week_start}_${e.week_end}`, e);
    });
    return map;
  }, [entries]);

  // Current entry
  const currentEntry = useMemo(() => {
    if (!selectedPeriodId) return null;
    return entriesMap.get(selectedPeriodId) || null;
  }, [entriesMap, selectedPeriodId]);

  // Settlement periods that don't have bookkeeping entries yet
  const availableSettlementPeriods = useMemo(() => {
    return settlementPeriods.filter(sp => {
      const key = `${sp.week_start}_${sp.week_end}`;
      return !entriesMap.has(key);
    });
  }, [settlementPeriods, entriesMap]);

  // Load form data when period changes
  useEffect(() => {
    setError(null);
    setSuccess(null);
    setShowDeleteConfirm(false);
    
    if (currentEntry) {
      setFormData({
        uber_earnings: currentEntry.uber_earnings.toString(),
        bolt_earnings: currentEntry.bolt_earnings.toString(),
        ecabs_earnings: currentEntry.ecabs_earnings.toString(),
        other_earnings: currentEntry.other_earnings.toString(),
        employees: currentEntry.employees.toString(),
        repairs: currentEntry.repairs.toString(),
        insurance: currentEntry.insurance.toString(),
        investments: currentEntry.investments.toString(),
        vat: currentEntry.vat.toString(),
        rent: currentEntry.rent.toString(),
        employee_tax: currentEntry.employee_tax.toString(),
        other_expenses: currentEntry.other_expenses.toString(),
        notes: currentEntry.notes || '',
      });
    } else {
      setFormData({
        uber_earnings: '',
        bolt_earnings: '',
        ecabs_earnings: '',
        other_earnings: '',
        employees: '',
        repairs: '',
        insurance: '',
        investments: '',
        vat: '',
        rent: '',
        employee_tax: '',
        other_expenses: '',
        notes: '',
      });
    }
  }, [currentEntry, selectedPeriodId]);

  // Calculate totals
  const calculations = useMemo(() => {
    const uberEarnings = parseFloat(formData.uber_earnings) || 0;
    const boltEarnings = parseFloat(formData.bolt_earnings) || 0;
    const ecabsEarnings = parseFloat(formData.ecabs_earnings) || 0;
    const otherEarnings = parseFloat(formData.other_earnings) || 0;
    
    const employees = parseFloat(formData.employees) || 0;
    const repairs = parseFloat(formData.repairs) || 0;
    const insurance = parseFloat(formData.insurance) || 0;
    const investments = parseFloat(formData.investments) || 0;
    const vat = parseFloat(formData.vat) || 0;
    const rent = parseFloat(formData.rent) || 0;
    const employeeTax = parseFloat(formData.employee_tax) || 0;
    const otherExpenses = parseFloat(formData.other_expenses) || 0;
    
    const totalIncome = uberEarnings + boltEarnings + ecabsEarnings + otherEarnings;
    const totalExpenses = employees + repairs + insurance + investments + vat + rent + employeeTax + otherExpenses;
    const netProfit = totalIncome - totalExpenses;
    
    return { totalIncome, totalExpenses, netProfit };
  }, [formData]);

  // Handle input change
  const handleChange = useCallback((field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  // Get current period info for display
  const currentPeriodInfo = useMemo(() => {
    if (isCreatingNew && newWeekStart && newWeekEnd) {
      return {
        week_start: newWeekStart,
        week_end: newWeekEnd,
        week_label: newWeekLabel || `${formatDateDisplay(newWeekStart)} - ${formatDateDisplay(newWeekEnd)}`,
        period_name: newPeriodName || null,
      };
    }
    if (currentEntry) {
      return {
        week_start: currentEntry.week_start,
        week_end: currentEntry.week_end,
        week_label: currentEntry.week_label,
        period_name: currentEntry.period_name,
      };
    }
    return null;
  }, [isCreatingNew, newWeekStart, newWeekEnd, newWeekLabel, newPeriodName, currentEntry]);

  // Select from settlement period
  const selectSettlementPeriod = (period: SettlementPeriod) => {
    setIsCreatingNew(true);
    setNewWeekStart(formatDateInput(period.week_start));
    setNewWeekEnd(formatDateInput(period.week_end));
    setNewWeekLabel(period.week_label);
    setNewPeriodName(period.period_name || '');
    setSelectedPeriodId(null);
  };

  // Start new custom period
  const startNewPeriod = () => {
    setIsCreatingNew(true);
    setNewWeekStart('');
    setNewWeekEnd('');
    setNewWeekLabel('');
    setNewPeriodName('');
    setSelectedPeriodId(null);
  };

  // Cancel new period
  const cancelNewPeriod = () => {
    setIsCreatingNew(false);
    setNewWeekStart('');
    setNewWeekEnd('');
    setNewWeekLabel('');
    setNewPeriodName('');
    if (entries.length > 0) {
      setSelectedPeriodId(`${entries[0].week_start}_${entries[0].week_end}`);
    }
  };

  // Save handler
  const handleSave = async () => {
    if (!currentPeriodInfo) return;
    
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const weekLabel = currentPeriodInfo.week_label || 
        `${formatDateDisplay(currentPeriodInfo.week_start)} - ${formatDateDisplay(currentPeriodInfo.week_end)}`;
      
      const payload = {
        week_start: currentPeriodInfo.week_start,
        week_end: currentPeriodInfo.week_end,
        week_label: weekLabel,
        period_name: currentPeriodInfo.period_name || null,
        uber_earnings: parseFloat(formData.uber_earnings) || 0,
        bolt_earnings: parseFloat(formData.bolt_earnings) || 0,
        ecabs_earnings: parseFloat(formData.ecabs_earnings) || 0,
        other_earnings: parseFloat(formData.other_earnings) || 0,
        employees: parseFloat(formData.employees) || 0,
        repairs: parseFloat(formData.repairs) || 0,
        insurance: parseFloat(formData.insurance) || 0,
        investments: parseFloat(formData.investments) || 0,
        vat: parseFloat(formData.vat) || 0,
        rent: parseFloat(formData.rent) || 0,
        employee_tax: parseFloat(formData.employee_tax) || 0,
        other_expenses: parseFloat(formData.other_expenses) || 0,
        notes: formData.notes || null,
      };

      const url = currentEntry 
        ? `/api/bookkeeping/${currentEntry.id}` 
        : '/api/bookkeeping';
      const method = currentEntry ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      setSuccess(`Entry ${currentEntry ? 'updated' : 'saved'} successfully!`);
      
      // If was creating new, switch to the new entry
      if (isCreatingNew) {
        setIsCreatingNew(false);
        setSelectedPeriodId(`${currentPeriodInfo.week_start}_${currentPeriodInfo.week_end}`);
      }
      
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (!currentEntry) return;
    
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/bookkeeping/${currentEntry.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete');
      }

      setSuccess('Entry deleted');
      setShowDeleteConfirm(false);
      setSelectedPeriodId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.workspace}>
      {/* Navigation Header */}
      <div className={styles.navHeader}>
        {/* Period Selection */}
        <div className={styles.weekNav}>
          <div className={styles.weekNavButtons}>
            <button 
              className={`${styles.navBtn} ${styles.primary}`} 
              onClick={startNewPeriod}
            >
              + New Period
            </button>
            
            {availableSettlementPeriods.length > 0 && (
              <select 
                className={styles.navBtn}
                onChange={(e) => {
                  const period = availableSettlementPeriods.find(
                    p => `${p.week_start}_${p.week_end}` === e.target.value
                  );
                  if (period) selectSettlementPeriod(period);
                }}
                value=""
                style={{ minWidth: '200px' }}
              >
                <option value="">Import from Settlements...</option>
                {availableSettlementPeriods.map((period) => (
                  <option 
                    key={`${period.week_start}_${period.week_end}`} 
                    value={`${period.week_start}_${period.week_end}`}
                  >
                    {period.week_label} ({formatDateDisplay(period.week_start)} - {formatDateDisplay(period.week_end)})
                  </option>
                ))}
              </select>
            )}
          </div>
          
          {currentPeriodInfo && (
            <div className={styles.weekInfo}>
              <div className={styles.weekNumber}>
                {currentPeriodInfo.period_name || currentPeriodInfo.week_label}
              </div>
              <div className={styles.weekDates}>
                {formatDateDisplay(currentPeriodInfo.week_start)} - {formatDateDisplay(currentPeriodInfo.week_end)}
              </div>
            </div>
          )}
          
          <div className={styles.weekNavButtons}>
            {isCreatingNew && (
              <button className={styles.navBtn} onClick={cancelNewPeriod}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={styles.mainContent}>
        {/* Sidebar - Recent Entries */}
        <div className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h3>Recent Entries</h3>
          </div>
          <div className={styles.weeksList}>
            {entries.length === 0 ? (
              <div className={styles.emptyWeeks}>No entries yet</div>
            ) : (
              entries.slice(0, 20).map((entry) => (
                <button
                  key={entry.id}
                  className={`${styles.weekCard} ${selectedPeriodId === `${entry.week_start}_${entry.week_end}` && !isCreatingNew ? styles.active : ''}`}
                  onClick={() => {
                    setIsCreatingNew(false);
                    setSelectedPeriodId(`${entry.week_start}_${entry.week_end}`);
                  }}
                >
                  <div className={styles.weekCardInfo}>
                    <span className={styles.weekCardLabel}>
                      {entry.period_name || entry.week_label}
                    </span>
                    <span className={styles.weekCardDates}>
                      {formatDateDisplay(entry.week_start)} - {formatDateDisplay(entry.week_end)}
                    </span>
                  </div>
                  <span className={`${styles.weekCardProfit} ${entry.net_profit >= 0 ? styles.positive : styles.negative}`}>
                    {formatCurrency(entry.net_profit)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Form Panel */}
        <div className={styles.formPanel}>
          {!currentPeriodInfo && !isCreatingNew ? (
            <div className={styles.formBody} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
              <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                <p>Select an entry from the sidebar or create a new period</p>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.formHeader}>
                <h3>
                  {isCreatingNew ? 'New Entry' : (currentPeriodInfo?.period_name || currentPeriodInfo?.week_label)}
                </h3>
                <div className={styles.headerActions}>
                  {currentEntry && (
                    <button 
                      className="btn btn-danger-outline"
                      onClick={() => setShowDeleteConfirm(true)}
                      disabled={loading}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              <div className={styles.formBody}>
                {error && <div className={`${styles.alert} ${styles.error}`}>{error}</div>}
                {success && <div className={`${styles.alert} ${styles.success}`}>{success}</div>}
                
                {showDeleteConfirm && (
                  <div className={styles.deleteConfirm}>
                    <p>Are you sure you want to delete this entry?</p>
                    <div className={styles.actions}>
                      <button className="btn btn-danger" onClick={handleDelete} disabled={loading}>
                        Yes, Delete
                      </button>
                      <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Period Dates (editable for new entries) */}
                {isCreatingNew && (
                  <div className={styles.section}>
                    <h4 className={styles.sectionTitle}>Period Dates</h4>
                    <div className={styles.inputGrid}>
                      <div className={styles.inputGroup}>
                        <label>Start Date</label>
                        <input
                          type="date"
                          value={newWeekStart}
                          onChange={(e) => setNewWeekStart(e.target.value)}
                        />
                      </div>
                      <div className={styles.inputGroup}>
                        <label>End Date</label>
                        <input
                          type="date"
                          value={newWeekEnd}
                          onChange={(e) => setNewWeekEnd(e.target.value)}
                        />
                      </div>
                      <div className={styles.inputGroup}>
                        <label>Label (e.g., Week 1)</label>
                        <input
                          type="text"
                          value={newWeekLabel}
                          onChange={(e) => setNewWeekLabel(e.target.value)}
                          placeholder="Week 1"
                        />
                      </div>
                      <div className={styles.inputGroup}>
                        <label>Period Name (optional)</label>
                        <input
                          type="text"
                          value={newPeriodName}
                          onChange={(e) => setNewPeriodName(e.target.value)}
                          placeholder="January Week 1"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Summary at top */}
                <div className={styles.section}>
                  <div className={styles.summaryGrid}>
                    <div className={`${styles.summaryCard} ${styles.income}`}>
                      <div className={styles.summaryLabel}>Total Income</div>
                      <div className={styles.summaryValue}>{formatCurrency(calculations.totalIncome)}</div>
                    </div>
                    <div className={`${styles.summaryCard} ${styles.expenses}`}>
                      <div className={styles.summaryLabel}>Total Expenses</div>
                      <div className={styles.summaryValue}>{formatCurrency(calculations.totalExpenses)}</div>
                    </div>
                    <div className={`${styles.summaryCard} ${styles.profit} ${calculations.netProfit < 0 ? styles.negative : ''}`}>
                      <div className={styles.summaryLabel}>Net Profit</div>
                      <div className={styles.summaryValue}>{formatCurrency(calculations.netProfit)}</div>
                    </div>
                  </div>
                </div>

                {/* Income Section */}
                <div className={styles.section}>
                  <h4 className={styles.sectionTitle}>Income (Platform Earnings)</h4>
                  <div className={styles.inputGrid}>
                    <div className={styles.inputGroup}>
                      <label>Uber</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.uber_earnings}
                          onChange={(e) => handleChange('uber_earnings', e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label>Bolt</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.bolt_earnings}
                          onChange={(e) => handleChange('bolt_earnings', e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label>eCabs</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.ecabs_earnings}
                          onChange={(e) => handleChange('ecabs_earnings', e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label>Other</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.other_earnings}
                          onChange={(e) => handleChange('other_earnings', e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expenses Section */}
                <div className={styles.section}>
                  <h4 className={styles.sectionTitle}>Expenses</h4>
                  <div className={styles.inputGrid}>
                    <div className={styles.inputGroup}>
                      <label>Employees</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.employees}
                          onChange={(e) => handleChange('employees', e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label>Repairs</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.repairs}
                          onChange={(e) => handleChange('repairs', e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label>Insurance</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.insurance}
                          onChange={(e) => handleChange('insurance', e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label>Investments</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.investments}
                          onChange={(e) => handleChange('investments', e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label>VAT</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.vat}
                          onChange={(e) => handleChange('vat', e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label>Rent</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.rent}
                          onChange={(e) => handleChange('rent', e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label>Employee Tax</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.employee_tax}
                          onChange={(e) => handleChange('employee_tax', e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label>Other</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.other_expenses}
                          onChange={(e) => handleChange('other_expenses', e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div className={styles.section}>
                  <h4 className={styles.sectionTitle}>Notes</h4>
                  <div className={styles.inputGrid}>
                    <div className={`${styles.inputGroup} ${styles.fullWidth}`}>
                      <textarea
                        value={formData.notes}
                        onChange={(e) => handleChange('notes', e.target.value)}
                        placeholder="Any notes for this period..."
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Footer */}
              <div className={styles.formFooter}>
                <div className={styles.footerLeft}>
                  {currentEntry && (
                    <span style={{ fontSize: 'var(--font-sm)', color: 'var(--text-muted)' }}>
                      Last updated: {new Date(currentEntry.updated_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className={styles.footerRight}>
                  <button 
                    className="btn btn-primary"
                    onClick={handleSave}
                    disabled={loading || (isCreatingNew && (!newWeekStart || !newWeekEnd))}
                  >
                    {loading ? 'Saving...' : currentEntry ? 'Update' : 'Save'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
