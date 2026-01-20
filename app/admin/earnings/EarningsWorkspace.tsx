'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { exportEarningsPdf } from '@/lib/utils/earningsPdfExport';
import type { MonthlyEarnings } from '@/lib/types/database';
import styles from './earnings.module.css';

interface EarningsWorkspaceProps {
  earnings: MonthlyEarnings[];
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function formatCurrency(value: number): string {
  return `€${value.toFixed(2)}`;
}

export default function EarningsWorkspace({ earnings }: EarningsWorkspaceProps) {
  const router = useRouter();
  
  // Year/month navigation
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    bolt_gross: '',
    uber_gross: '',
    offapp_gross: '',
    bolt_vat: '',
    uber_vat: '',
    offapp_vat: '',
    bolt_commission: '',
    uber_commission: '',
    driver_settlements_total: '',
    rent: '',
    utilities: '',
    insurance: '',
    ni_tax: '',
    services_total: '',
    fuel: '',
    vehicle_expenses: '',
    other_expenses: '',
    other_expenses_notes: '',
    notes: '',
  });
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Get available years
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    const now = new Date();
    years.add(now.getFullYear());
    years.add(now.getFullYear() - 1);
    
    earnings.forEach(e => {
      years.add(new Date(e.month).getFullYear());
    });
    
    return Array.from(years).sort((a, b) => b - a);
  }, [earnings]);

  // Get months with data for selected year
  const monthsData = useMemo(() => {
    const data = new Map<number, MonthlyEarnings>();
    
    earnings.forEach(e => {
      const date = new Date(e.month);
      if (date.getFullYear() === selectedYear) {
        data.set(date.getMonth(), e);
      }
    });
    
    return data;
  }, [earnings, selectedYear]);

  // Current selected earnings record
  const currentEarnings = useMemo(() => {
    if (selectedMonth === null) return null;
    return monthsData.get(selectedMonth) || null;
  }, [selectedMonth, monthsData]);

  // Load form data when selecting a month
  const selectMonth = useCallback((month: number) => {
    setSelectedMonth(month);
    setError(null);
    setSuccess(null);
    setShowDeleteConfirm(false);
    
    const existing = monthsData.get(month);
    
    if (existing) {
      setFormData({
        bolt_gross: existing.bolt_gross.toString(),
        uber_gross: existing.uber_gross.toString(),
        offapp_gross: existing.offapp_gross.toString(),
        bolt_vat: existing.bolt_vat.toString(),
        uber_vat: existing.uber_vat.toString(),
        offapp_vat: existing.offapp_vat.toString(),
        bolt_commission: existing.bolt_commission.toString(),
        uber_commission: existing.uber_commission.toString(),
        driver_settlements_total: existing.driver_settlements_total.toString(),
        rent: existing.rent.toString(),
        utilities: existing.utilities.toString(),
        insurance: existing.insurance.toString(),
        ni_tax: existing.ni_tax.toString(),
        services_total: existing.services_total.toString(),
        fuel: existing.fuel.toString(),
        vehicle_expenses: existing.vehicle_expenses.toString(),
        other_expenses: existing.other_expenses.toString(),
        other_expenses_notes: existing.other_expenses_notes || '',
        notes: existing.notes || '',
      });
    } else {
      setFormData({
        bolt_gross: '0',
        uber_gross: '0',
        offapp_gross: '0',
        bolt_vat: '0',
        uber_vat: '0',
        offapp_vat: '0',
        bolt_commission: '0',
        uber_commission: '0',
        driver_settlements_total: '0',
        rent: '0',
        utilities: '0',
        insurance: '0',
        ni_tax: '0',
        services_total: '0',
        fuel: '0',
        vehicle_expenses: '0',
        other_expenses: '0',
        other_expenses_notes: '',
        notes: '',
      });
    }
  }, [monthsData]);

  // Handle input change
  const handleChange = useCallback((field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  // Calculate totals in real-time
  const calculations = useMemo(() => {
    const boltGross = parseFloat(formData.bolt_gross) || 0;
    const uberGross = parseFloat(formData.uber_gross) || 0;
    const offappGross = parseFloat(formData.offapp_gross) || 0;
    
    const boltVat = parseFloat(formData.bolt_vat) || 0;
    const uberVat = parseFloat(formData.uber_vat) || 0;
    const offappVat = parseFloat(formData.offapp_vat) || 0;
    
    const boltCommission = parseFloat(formData.bolt_commission) || 0;
    const uberCommission = parseFloat(formData.uber_commission) || 0;
    
    const driverSettlements = parseFloat(formData.driver_settlements_total) || 0;
    const rent = parseFloat(formData.rent) || 0;
    const utilities = parseFloat(formData.utilities) || 0;
    const insurance = parseFloat(formData.insurance) || 0;
    const niTax = parseFloat(formData.ni_tax) || 0;
    const servicesTotal = parseFloat(formData.services_total) || 0;
    const fuel = parseFloat(formData.fuel) || 0;
    const vehicleExpenses = parseFloat(formData.vehicle_expenses) || 0;
    const otherExpenses = parseFloat(formData.other_expenses) || 0;
    
    const totalGrossRevenue = boltGross + uberGross + offappGross;
    const totalVat = boltVat + uberVat + offappVat;
    const totalCommissions = boltCommission + uberCommission;
    const netRevenue = totalGrossRevenue - totalVat - totalCommissions;
    const totalExpenses = driverSettlements + rent + utilities + insurance + niTax + servicesTotal + fuel + vehicleExpenses + otherExpenses;
    const netProfit = netRevenue - totalExpenses;
    
    return {
      totalGrossRevenue,
      totalVat,
      totalCommissions,
      netRevenue,
      totalExpenses,
      netProfit,
    };
  }, [formData]);

  // Save handler
  const handleSave = async (status: 'draft' | 'finalized' = 'draft') => {
    if (selectedMonth === null) return;
    
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
      
      const payload = {
        month: monthStr,
        bolt_gross: parseFloat(formData.bolt_gross) || 0,
        uber_gross: parseFloat(formData.uber_gross) || 0,
        offapp_gross: parseFloat(formData.offapp_gross) || 0,
        bolt_vat: parseFloat(formData.bolt_vat) || 0,
        uber_vat: parseFloat(formData.uber_vat) || 0,
        offapp_vat: parseFloat(formData.offapp_vat) || 0,
        bolt_commission: parseFloat(formData.bolt_commission) || 0,
        uber_commission: parseFloat(formData.uber_commission) || 0,
        driver_settlements_total: parseFloat(formData.driver_settlements_total) || 0,
        rent: parseFloat(formData.rent) || 0,
        utilities: parseFloat(formData.utilities) || 0,
        insurance: parseFloat(formData.insurance) || 0,
        ni_tax: parseFloat(formData.ni_tax) || 0,
        services_total: parseFloat(formData.services_total) || 0,
        fuel: parseFloat(formData.fuel) || 0,
        vehicle_expenses: parseFloat(formData.vehicle_expenses) || 0,
        other_expenses: parseFloat(formData.other_expenses) || 0,
        other_expenses_notes: formData.other_expenses_notes || null,
        notes: formData.notes || null,
        status,
      };

      const url = currentEarnings 
        ? `/api/earnings/${currentEarnings.id}` 
        : '/api/earnings';
      const method = currentEarnings ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      setSuccess(`Earnings ${currentEarnings ? 'updated' : 'saved'} successfully!`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (!currentEarnings) return;
    
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/earnings/${currentEarnings.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete');
      }

      setSuccess('Earnings record deleted');
      setSelectedMonth(null);
      setShowDeleteConfirm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Export PDF
  const handleExportPdf = useCallback(() => {
    if (selectedMonth === null) return;
    
    const monthLabel = `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;
    
    exportEarningsPdf({
      monthLabel,
      data: {
        boltGross: parseFloat(formData.bolt_gross) || 0,
        uberGross: parseFloat(formData.uber_gross) || 0,
        offappGross: parseFloat(formData.offapp_gross) || 0,
        boltVat: parseFloat(formData.bolt_vat) || 0,
        uberVat: parseFloat(formData.uber_vat) || 0,
        offappVat: parseFloat(formData.offapp_vat) || 0,
        boltCommission: parseFloat(formData.bolt_commission) || 0,
        uberCommission: parseFloat(formData.uber_commission) || 0,
        driverSettlements: parseFloat(formData.driver_settlements_total) || 0,
        rent: parseFloat(formData.rent) || 0,
        utilities: parseFloat(formData.utilities) || 0,
        insurance: parseFloat(formData.insurance) || 0,
        niTax: parseFloat(formData.ni_tax) || 0,
        servicesTotal: parseFloat(formData.services_total) || 0,
        fuel: parseFloat(formData.fuel) || 0,
        vehicleExpenses: parseFloat(formData.vehicle_expenses) || 0,
        otherExpenses: parseFloat(formData.other_expenses) || 0,
        otherExpensesNotes: formData.other_expenses_notes,
        notes: formData.notes,
        ...calculations,
      },
      status: currentEarnings?.status || 'draft',
    });
  }, [selectedMonth, selectedYear, formData, calculations, currentEarnings]);

  return (
    <>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>
          <h2>Monthly Earnings</h2>
          <p className={styles.pageSubtitle}>
            Track monthly revenue, expenses, and profit
          </p>
        </div>
      </div>

      <div className={styles.container}>
        {/* Sidebar - Month Selection */}
        <div className={styles.sidebar}>
          <div className={styles.monthList}>
            <div className={styles.monthListHeader}>
              <h3>Select Month</h3>
              <div className={styles.yearSelector}>
                <button 
                  onClick={() => setSelectedYear(y => y - 1)}
                  disabled={!availableYears.includes(selectedYear - 1) && selectedYear <= Math.min(...availableYears)}
                >
                  ←
                </button>
                <span>{selectedYear}</span>
                <button 
                  onClick={() => setSelectedYear(y => y + 1)}
                  disabled={selectedYear >= new Date().getFullYear()}
                >
                  →
                </button>
              </div>
            </div>
            <div className={styles.monthItems}>
              {MONTH_NAMES.map((name, idx) => {
                const data = monthsData.get(idx);
                const isFuture = selectedYear === new Date().getFullYear() && idx > new Date().getMonth();
                
                if (isFuture) return null;
                
                return (
                  <div
                    key={idx}
                    className={`${styles.monthItem} ${selectedMonth === idx ? styles.selected : ''} ${data ? styles.hasData : ''}`}
                    onClick={() => selectMonth(idx)}
                  >
                    <div className={styles.monthName}>
                      <span>{name}</span>
                      {data && (
                        <span className={`${styles.monthStatus} ${data.status === 'draft' ? styles.draft : ''}`}>
                          {data.status}
                        </span>
                      )}
                    </div>
                    {data && (
                      <span className={`${styles.monthProfit} ${data.net_profit >= 0 ? styles.positive : styles.negative}`}>
                        {formatCurrency(data.net_profit)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Content - Form */}
        <div className={styles.mainContent}>
          {selectedMonth === null ? (
            <div className={styles.formCard}>
              <div className={styles.emptyState}>
                <h3>Select a Month</h3>
                <p>Choose a month from the list to view or enter earnings data</p>
              </div>
            </div>
          ) : (
            <div className={styles.formCard}>
              <div className={styles.formHeader}>
                <h3>{MONTH_NAMES[selectedMonth]} {selectedYear}</h3>
                <div className={styles.pageActions}>
                  <button 
                    className="btn btn-secondary"
                    onClick={handleExportPdf}
                    disabled={loading}
                  >
                    📄 Export PDF
                  </button>
                  {currentEarnings && (
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
                {error && <div className={styles.error}>{error}</div>}
                {success && <div className={styles.success}>{success}</div>}
                
                {showDeleteConfirm && (
                  <div className={styles.deleteConfirm}>
                    <p>Are you sure you want to delete this earnings record?</p>
                    <div className="actions">
                      <button className="btn btn-danger" onClick={handleDelete} disabled={loading}>
                        Yes, Delete
                      </button>
                      <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Revenue Section */}
                <div className={styles.section}>
                  <h4 className={styles.sectionTitle}>Platform Revenue (Gross)</h4>
                  <div className={styles.inputGrid}>
                    <div className={styles.inputGroup}>
                      <label>Bolt Gross Sales</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.bolt_gross}
                          onChange={(e) => handleChange('bolt_gross', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label>Uber Gross Sales</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.uber_gross}
                          onChange={(e) => handleChange('uber_gross', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label>Off-App / Other</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.offapp_gross}
                          onChange={(e) => handleChange('offapp_gross', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* VAT Section */}
                <div className={styles.section}>
                  <h4 className={styles.sectionTitle}>VAT (18%)</h4>
                  <div className={styles.inputGrid}>
                    <div className={styles.inputGroup}>
                      <label>Bolt VAT</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.bolt_vat}
                          onChange={(e) => handleChange('bolt_vat', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label>Uber VAT</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.uber_vat}
                          onChange={(e) => handleChange('uber_vat', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label>Off-App VAT</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.offapp_vat}
                          onChange={(e) => handleChange('offapp_vat', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Commissions Section */}
                <div className={styles.section}>
                  <h4 className={styles.sectionTitle}>Platform Commissions (20%)</h4>
                  <div className={styles.inputGrid}>
                    <div className={styles.inputGroup}>
                      <label>Bolt Commission</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.bolt_commission}
                          onChange={(e) => handleChange('bolt_commission', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label>Uber Commission</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.uber_commission}
                          onChange={(e) => handleChange('uber_commission', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Driver Settlements */}
                <div className={styles.section}>
                  <h4 className={styles.sectionTitle}>Driver Costs</h4>
                  <div className={styles.inputGrid}>
                    <div className={styles.inputGroup}>
                      <label>Total Driver Settlements</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.driver_settlements_total}
                          onChange={(e) => handleChange('driver_settlements_total', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Operating Expenses */}
                <div className={styles.section}>
                  <h4 className={styles.sectionTitle}>Operating Expenses</h4>
                  <div className={styles.inputGrid}>
                    <div className={styles.inputGroup}>
                      <label>Rent</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.rent}
                          onChange={(e) => handleChange('rent', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label>Utilities</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.utilities}
                          onChange={(e) => handleChange('utilities', e.target.value)}
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
                        />
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label>NI / Tax</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.ni_tax}
                          onChange={(e) => handleChange('ni_tax', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label>Services Total</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.services_total}
                          onChange={(e) => handleChange('services_total', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label>Fuel</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.fuel}
                          onChange={(e) => handleChange('fuel', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label>Vehicle Expenses</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.vehicle_expenses}
                          onChange={(e) => handleChange('vehicle_expenses', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className={styles.inputGroup}>
                      <label>Other Expenses</label>
                      <div className={styles.currencyInput}>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.other_expenses}
                          onChange={(e) => handleChange('other_expenses', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className={`${styles.inputGroup} ${styles.fullWidth}`}>
                      <label>Other Expenses Notes</label>
                      <textarea
                        value={formData.other_expenses_notes}
                        onChange={(e) => handleChange('other_expenses_notes', e.target.value)}
                        placeholder="Describe other expenses..."
                      />
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div className={styles.section}>
                  <h4 className={styles.sectionTitle}>Summary</h4>
                  <div className={styles.summaryGrid}>
                    <div className={`${styles.summaryCard} ${styles.revenue}`}>
                      <div className={styles.summaryLabel}>Net Revenue</div>
                      <div className={styles.summaryValue}>{formatCurrency(calculations.netRevenue)}</div>
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

                {/* Notes */}
                <div className={styles.section}>
                  <h4 className={styles.sectionTitle}>Notes</h4>
                  <div className={styles.inputGrid}>
                    <div className={`${styles.inputGroup} ${styles.fullWidth}`}>
                      <textarea
                        value={formData.notes}
                        onChange={(e) => handleChange('notes', e.target.value)}
                        placeholder="Any additional notes for this month..."
                      />
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className={styles.formActions}>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => handleSave('draft')}
                    disabled={loading}
                  >
                    {loading ? 'Saving...' : 'Save Draft'}
                  </button>
                  <button 
                    className="btn btn-primary"
                    onClick={() => handleSave('finalized')}
                    disabled={loading}
                  >
                    {loading ? 'Saving...' : 'Save & Finalize'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
