'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import DatePicker from '@/components/shared/DatePicker';
import { PLATFORMS, getDefaultFssTax } from '@/lib/config/settlements';
import { 
  calculateSettlement, 
  formatCurrency, 
  type PlatformEarningsInput 
} from '@/lib/utils/settlementCalculations';
import type { Driver, DriverSettlement, SettlementPlatform } from '@/lib/types/database';
import styles from './settlements.module.css';

interface DriverWithStatus extends Pick<Driver, 'id' | 'full_name'> {
  status: string;
}

interface SettlementWithRelations extends DriverSettlement {
  drivers: Pick<Driver, 'id' | 'full_name'> & { status: string } | null;
  settlement_platforms: SettlementPlatform[];
  settlement_month?: string | null;
}

interface PlatformFormData {
  platformId: string;
  platformName: string;
  grossFare: string;
  platformFeePercent: string;
  cashRide: string;
  tips: string;
  campaigns: string;
}

interface SettlementsWorkspaceProps {
  activeDrivers: DriverWithStatus[];
  archivedDrivers: DriverWithStatus[];
  settlements: SettlementWithRelations[];
  isAdmin: boolean;
}

export default function SettlementsWorkspace({
  activeDrivers,
  archivedDrivers,
  settlements,
  isAdmin,
}: SettlementsWorkspaceProps) {
  const router = useRouter();
  
  // Navigation state - Year > Month > Week hierarchy
  // Use lazy initialization to avoid hydration mismatch
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(() => new Date().getMonth()); // 0-11
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  
  // Period creation state
  const [isCreatingPeriod, setIsCreatingPeriod] = useState(false);
  const [newPeriodStart, setNewPeriodStart] = useState('');
  const [newPeriodEnd, setNewPeriodEnd] = useState('');
  const [newPeriodName, setNewPeriodName] = useState('');
  const [newPeriodMonth, setNewPeriodMonth] = useState('');
  
  // Driver selection state
  const [showArchived, setShowArchived] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Form state
  const [periodName, setPeriodName] = useState('');
  const [fssTax, setFssTax] = useState(getDefaultFssTax().toString());
  const [notes, setNotes] = useState('');
  const [platformData, setPlatformData] = useState<PlatformFormData[]>(() => 
    PLATFORMS.map(p => ({
      platformId: p.id,
      platformName: p.name,
      grossFare: '0',
      platformFeePercent: p.defaultFeePercent.toString(),
      cashRide: '0',
      tips: '0',
      campaigns: '0',
    }))
  );
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Month names
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Get available years from settlements
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    const now = new Date();
    years.add(now.getFullYear()); // Always include current year
    years.add(now.getFullYear() + 1); // And next year
    
    settlements.forEach(s => {
      if (s.settlement_month) {
        years.add(new Date(s.settlement_month).getFullYear());
      }
      years.add(new Date(s.week_start).getFullYear());
    });
    
    return Array.from(years).sort((a, b) => b - a); // Descending
  }, [settlements]);

  // Get months with data for selected year
  const monthsWithData = useMemo(() => {
    const months = new Map<number, { count: number; total: number }>();
    
    // Initialize all months
    for (let i = 0; i < 12; i++) {
      months.set(i, { count: 0, total: 0 });
    }
    
    settlements.forEach(s => {
      // Use settlement_month if set, otherwise derive from week_start
      const monthDate = s.settlement_month 
        ? new Date(s.settlement_month) 
        : new Date(s.week_start);
      
      if (monthDate.getFullYear() === selectedYear) {
        const month = monthDate.getMonth();
        const current = months.get(month) || { count: 0, total: 0 };
        months.set(month, {
          count: current.count + 1,
          total: current.total + (s.final_balance || 0),
        });
      }
    });
    
    return months;
  }, [settlements, selectedYear]);

  // Get weeks for selected month
  const weeksInMonth = useMemo(() => {
    if (selectedMonth === null) return [];
    
    const weekMap = new Map<string, {
      id: string;
      startISO: string;
      endISO: string;
      label: string;
      periodName: string | null;
      settlementMonth: string | null;
      settlementCount: number;
      totalBalance: number;
    }>();
    
    settlements.forEach(s => {
      // Check if this settlement belongs to the selected month
      const settlementMonthDate = s.settlement_month 
        ? new Date(s.settlement_month)
        : new Date(s.week_start);
      
      if (settlementMonthDate.getFullYear() === selectedYear && 
          settlementMonthDate.getMonth() === selectedMonth) {
        
        if (!weekMap.has(s.week_start)) {
          weekMap.set(s.week_start, {
            id: s.week_start,
            startISO: s.week_start,
            endISO: s.week_end,
            label: s.week_label,
            periodName: s.period_name,
            settlementMonth: s.settlement_month || null,
            settlementCount: 0,
            totalBalance: 0,
          });
        }
        
        const week = weekMap.get(s.week_start)!;
        week.settlementCount++;
        week.totalBalance += s.final_balance || 0;
      }
    });
    
    return Array.from(weekMap.values()).sort((a, b) => 
      new Date(b.startISO).getTime() - new Date(a.startISO).getTime()
    );
  }, [settlements, selectedYear, selectedMonth]);

  // Extract unique periods from existing settlements
  const existingPeriods = useMemo(() => {
    const periodMap = new Map<string, { 
      id: string; 
      startISO: string; 
      endISO: string; 
      label: string;
      periodName: string | null;
      settlementMonth: string | null;
    }>();
    
    settlements.forEach(s => {
      if (!periodMap.has(s.week_start)) {
        periodMap.set(s.week_start, {
          id: s.week_start, // Use start date as unique ID
          startISO: s.week_start,
          endISO: s.week_end,
          label: s.week_label,
          periodName: s.period_name,
          settlementMonth: s.settlement_month || null,
        });
      }
    });
    
    // Sort by start date descending (newest first)
    return Array.from(periodMap.values()).sort((a, b) => 
      new Date(b.startISO).getTime() - new Date(a.startISO).getTime()
    );
  }, [settlements]);

  // Get current period info
  const currentPeriod = useMemo(() => {
    // New period (either confirmed with "new_" ID or still in creation form)
    const isNewPeriod = selectedWeekId?.startsWith('new_') || isCreatingPeriod;
    if (isNewPeriod && newPeriodStart && newPeriodEnd) {
      const start = new Date(newPeriodStart);
      const end = new Date(newPeriodEnd);
      const formatOptions: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
      const startStr = start.toLocaleDateString('en-GB', formatOptions);
      const endStr = end.toLocaleDateString('en-GB', { ...formatOptions, year: 'numeric' });
      return {
        startISO: newPeriodStart,
        endISO: newPeriodEnd,
        label: `${startStr} – ${endStr}`,
        periodName: newPeriodName || periodName || null,
        settlementMonth: newPeriodMonth || null,
        isNew: true,
      };
    }
    
    // Existing period from database
    const period = existingPeriods.find(p => p.id === selectedWeekId);
    if (period) {
      return {
        startISO: period.startISO,
        endISO: period.endISO,
        label: period.label,
        periodName: period.periodName,
        settlementMonth: period.settlementMonth,
        isNew: false,
      };
    }
    
    return null;
  }, [isCreatingPeriod, newPeriodStart, newPeriodEnd, newPeriodName, newPeriodMonth, periodName, selectedWeekId, existingPeriods]);

  // Filter drivers by search
  const displayedDrivers = useMemo(() => {
    const drivers = showArchived ? archivedDrivers : activeDrivers;
    if (!searchQuery.trim()) return drivers;
    const query = searchQuery.toLowerCase();
    return drivers.filter(d => d.full_name.toLowerCase().includes(query));
  }, [showArchived, activeDrivers, archivedDrivers, searchQuery]);

  // Get settlement for selected driver and period
  const existingSettlement = useMemo(() => {
    if (!selectedDriverId || !currentPeriod) return null;
    return settlements.find(s => 
      s.driver_id === selectedDriverId && 
      s.week_start === currentPeriod.startISO
    );
  }, [selectedDriverId, currentPeriod, settlements]);

  // Get settlements for current period (for status indicators)
  const periodSettlements = useMemo(() => {
    if (!currentPeriod) return [];
    return settlements.filter(s => s.week_start === currentPeriod.startISO);
  }, [settlements, currentPeriod]);

  // Check if driver has settlement for current period
  const hasSettlement = useCallback((driverId: string) => {
    return periodSettlements.some(s => s.driver_id === driverId);
  }, [periodSettlements]);

  // Get driver's settlement status
  const getDriverStatus = useCallback((driverId: string) => {
    const settlement = periodSettlements.find(s => s.driver_id === driverId);
    if (!settlement) return 'pending';
    return settlement.status;
  }, [periodSettlements]);

  // Load existing settlement data when selecting a driver
  const selectDriver = useCallback((driverId: string) => {
    if (!currentPeriod) return;
    
    setSelectedDriverId(driverId);
    setError(null);
    setSuccessMessage(null);
    
    const existing = settlements.find(s => 
      s.driver_id === driverId && 
      s.week_start === currentPeriod.startISO
    );
    
    if (existing) {
      setPeriodName(existing.period_name || currentPeriod.periodName || '');
      setFssTax(existing.fss_tax.toString());
      setNotes(existing.notes || '');
      setPlatformData(PLATFORMS.map(platform => {
        const existingPlatform = existing.settlement_platforms?.find(
          p => p.platform_id === platform.id
        );
        return {
          platformId: platform.id,
          platformName: platform.name,
          grossFare: existingPlatform?.gross_fare?.toString() || '0',
          platformFeePercent: existingPlatform?.platform_fee_percent?.toString() || platform.defaultFeePercent.toString(),
          cashRide: existingPlatform?.cash_ride?.toString() || '0',
          tips: existingPlatform?.tips?.toString() || '0',
          campaigns: existingPlatform?.campaigns?.toString() || '0',
        };
      }));
    } else {
      // Reset to defaults - keep periodName from current period
      setPeriodName(currentPeriod.periodName || newPeriodName || '');
      setFssTax(getDefaultFssTax().toString());
      setNotes('');
      setPlatformData(PLATFORMS.map(p => ({
        platformId: p.id,
        platformName: p.name,
        grossFare: '0',
        platformFeePercent: p.defaultFeePercent.toString(),
        cashRide: '0',
        tips: '0',
        campaigns: '0',
      })));
    }
  }, [currentPeriod, settlements, newPeriodName]);

  // Handle platform data change
  const handlePlatformChange = useCallback((
    index: number,
    field: keyof PlatformFormData,
    value: string
  ) => {
    setPlatformData(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  // Calculate settlement in real-time
  const calculation = useMemo(() => {
    const inputs: PlatformEarningsInput[] = platformData.map(p => ({
      platformId: p.platformId,
      grossFare: parseFloat(p.grossFare) || 0,
      platformFeePercent: parseFloat(p.platformFeePercent) || 0,
      cashRide: parseFloat(p.cashRide) || 0,
      tips: parseFloat(p.tips) || 0,
      campaigns: parseFloat(p.campaigns) || 0,
    }));
    return calculateSettlement(inputs, parseFloat(fssTax) || 0);
  }, [platformData, fssTax]);

  // Save settlement
  const handleSave = async (status: 'draft' | 'finalized' = 'draft') => {
    if (!selectedDriverId || !isAdmin || !currentPeriod) return;
    
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Get settlement month - prioritize: currentPeriod.settlementMonth > selected navigation month
      let settlementMonth = currentPeriod.settlementMonth;
      
      // Fallback: derive from selected month in navigation if not set
      // Use string construction to avoid timezone issues
      if (!settlementMonth && selectedMonth !== null) {
        const month = String(selectedMonth + 1).padStart(2, '0');
        settlementMonth = `${selectedYear}-${month}-01`;
      }
      
      const payload = {
        driver_id: selectedDriverId,
        week_start: currentPeriod.startISO,
        week_end: currentPeriod.endISO,
        week_label: currentPeriod.label,
        period_name: periodName || null,
        settlement_month: settlementMonth || null,
        fss_tax: parseFloat(fssTax) || 0,
        notes: notes || null,
        status,
        platforms: platformData.map(p => ({
          platform_id: p.platformId,
          platform_name: p.platformName,
          gross_fare: parseFloat(p.grossFare) || 0,
          platform_fee_percent: parseFloat(p.platformFeePercent) || 0,
          cash_ride: parseFloat(p.cashRide) || 0,
          tips: parseFloat(p.tips) || 0,
          campaigns: parseFloat(p.campaigns) || 0,
        })),
      };

      const url = existingSettlement 
        ? `/api/settlements/${existingSettlement.id}` 
        : '/api/settlements';
      const method = existingSettlement ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      setSuccessMessage(`Settlement ${existingSettlement ? 'updated' : 'created'} successfully!`);
      
      // If this was a new week, update the selectedWeekId to the actual week_start
      if (selectedWeekId?.startsWith('new_')) {
        setSelectedWeekId(currentPeriod.startISO);
        // Clear new period state
        setNewPeriodStart('');
        setNewPeriodEnd('');
        setNewPeriodName('');
        setNewPeriodMonth('');
      }
      
      router.refresh();
      
      // Auto-advance to next driver without settlement
      const currentIndex = displayedDrivers.findIndex(d => d.id === selectedDriverId);
      const nextDriver = displayedDrivers.slice(currentIndex + 1).find(d => !hasSettlement(d.id));
      if (nextDriver) {
        setTimeout(() => selectDriver(nextDriver.id), 500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Delete settlement
  const handleDelete = async () => {
    if (!existingSettlement || !isAdmin) return;
    if (!confirm('Are you sure you want to delete this settlement?')) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/settlements/${existingSettlement.id}`, { method: 'DELETE' });
      if (res.ok) {
        setSuccessMessage('Settlement deleted');
        router.refresh();
        selectDriver(selectedDriverId!);
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Delete failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setLoading(false);
    }
  };

  // Toggle paid status for a settlement
  const togglePaid = async (settlementId: string, currentlyPaid: boolean) => {
    if (!isAdmin) return;
    
    try {
      const res = await fetch(`/api/settlements/${settlementId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paid_at: currentlyPaid ? null : new Date().toISOString(),
        }),
      });

      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update paid status');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update paid status');
    }
  };

  // Get current driver index and selected driver (computed directly, not memoized)
  const currentDriverIndex = selectedDriverId 
    ? displayedDrivers.findIndex(d => d.id === selectedDriverId) 
    : -1;
  const selectedDriver = displayedDrivers.find(d => d.id === selectedDriverId);

  // Navigate to previous driver
  const goToPrevDriver = () => {
    if (currentDriverIndex <= 0) return;
    const prevDriver = displayedDrivers[currentDriverIndex - 1];
    if (prevDriver) {
      selectDriver(prevDriver.id);
    }
  };

  // Navigate to next driver
  const goToNextDriver = () => {
    if (currentDriverIndex >= displayedDrivers.length - 1) return;
    const nextDriver = displayedDrivers[currentDriverIndex + 1];
    if (nextDriver) {
      selectDriver(nextDriver.id);
    }
  };

  // Cancel creating a new period
  const cancelNewPeriod = () => {
    setIsCreatingPeriod(false);
    setNewPeriodStart('');
    setNewPeriodEnd('');
    setNewPeriodName('');
  };

  // Confirm the new period and start entering data
  const confirmNewPeriod = () => {
    if (!newPeriodStart || !newPeriodEnd) {
      setError('Please select both start and end dates');
      return;
    }
    setPeriodName(newPeriodName);
    // Mark period as confirmed - this will show the driver sidebar
    setIsCreatingPeriod(false);
    // Set a temporary ID so currentPeriod is populated
    setSelectedWeekId(`new_${newPeriodStart}`);
  };

  return (
    <div className={styles.workspace}>
      {/* Navigation Header: Year > Month > Week */}
      <div className={styles.navHeader}>
        {/* Year Selector */}
        <div className={styles.yearSelector}>
          {availableYears.map(year => (
            <button
              key={year}
              className={`${styles.yearBtn} ${year === selectedYear ? styles.active : ''}`}
              onClick={() => {
                setSelectedYear(year);
                setSelectedMonth(null);
                setSelectedWeekId(null);
                setSelectedDriverId(null);
              }}
            >
              {year}
            </button>
          ))}
        </div>

        {/* Month Grid */}
        <div className={styles.monthGrid}>
          {monthNames.map((name, idx) => {
            const data = monthsWithData.get(idx) || { count: 0, total: 0 };
            const isSelected = selectedMonth === idx;
            const hasData = data.count > 0;
            
            return (
              <button
                key={idx}
                className={`${styles.monthCard} ${isSelected ? styles.active : ''} ${hasData ? styles.hasData : ''}`}
                onClick={() => {
                  setSelectedMonth(idx);
                  setSelectedWeekId(null);
                  setSelectedDriverId(null);
                  setIsCreatingPeriod(false);
                }}
              >
                <span className={styles.monthName}>{name.slice(0, 3)}</span>
                {hasData && (
                  <span className={styles.monthCount}>{data.count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Weeks in Selected Month */}
        {selectedMonth !== null && (
          <div className={styles.weeksList}>
            <div className={styles.weeksHeader}>
              <h3>{monthNames[selectedMonth]} {selectedYear}</h3>
              {isAdmin && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setIsCreatingPeriod(true);
                    setSelectedWeekId(null);
                    setSelectedDriverId(null);
                    // Pre-fill month - use string construction to avoid timezone issues
                    const month = String(selectedMonth + 1).padStart(2, '0');
                    setNewPeriodMonth(`${selectedYear}-${month}-01`);
                  }}
                >
                  + New Week
                </button>
              )}
            </div>

            {/* New Period Form */}
            {isCreatingPeriod && (
              <div className={styles.newPeriodForm}>
                <div className={styles.formRow}>
                  <DatePicker
                    value={newPeriodStart}
                    onChange={setNewPeriodStart}
                    placeholder="Start date"
                  />
                  <span>to</span>
                  <DatePicker
                    value={newPeriodEnd}
                    onChange={setNewPeriodEnd}
                    placeholder="End date"
                    minDate={newPeriodStart}
                  />
                </div>
                <input
                  type="text"
                  placeholder="Week name (e.g. Week 1)"
                  value={newPeriodName}
                  onChange={(e) => {
                    setNewPeriodName(e.target.value);
                    setPeriodName(e.target.value);
                  }}
                  className={styles.periodNameInput}
                />
                <div className={styles.formActions}>
                  {newPeriodStart && newPeriodEnd && (
                    <button className="btn btn-primary btn-sm" onClick={confirmNewPeriod}>
                      Continue
                    </button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={cancelNewPeriod}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Week Cards */}
            <div className={styles.weekCards}>
              {/* Show new week card if one is being created */}
              {selectedWeekId?.startsWith('new_') && currentPeriod && (
                <div className={`${styles.weekCard} ${styles.active} ${styles.newWeek}`}>
                  <div className={styles.weekCardHeader}>
                    <span className={styles.weekName}>{currentPeriod.periodName || 'New Week'}</span>
                    <span className={styles.weekDates}>{currentPeriod.label}</span>
                  </div>
                  <div className={styles.weekCardStats}>
                    <span className={styles.newBadge}>New - Select a driver to add settlements</span>
                  </div>
                </div>
              )}
              
              {/* Existing weeks */}
              {weeksInMonth.map(week => (
                <button
                  key={week.id}
                  className={`${styles.weekCard} ${selectedWeekId === week.id ? styles.active : ''}`}
                  onClick={() => {
                    setSelectedWeekId(week.id);
                    setIsCreatingPeriod(false);
                    setSelectedDriverId(null);
                    setPeriodName(week.periodName || '');
                  }}
                >
                  <div className={styles.weekCardHeader}>
                    <span className={styles.weekName}>{week.periodName || week.label}</span>
                    <span className={styles.weekDates}>{week.label}</span>
                  </div>
                  <div className={styles.weekCardStats}>
                    <span>{week.settlementCount} settlements</span>
                    <span className={styles.weekTotal}>{formatCurrency(week.totalBalance)}</span>
                  </div>
                </button>
              ))}
            </div>
            
            {/* Empty state - only show if no weeks and not creating */}
            {weeksInMonth.length === 0 && !isCreatingPeriod && !selectedWeekId?.startsWith('new_') && (
              <div className={styles.emptyWeeks}>
                <p>No weeks in {monthNames[selectedMonth]} {selectedYear}</p>
                {isAdmin && (
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setIsCreatingPeriod(true);
                      // Use string construction to avoid timezone issues
                      const month = String(selectedMonth + 1).padStart(2, '0');
                      setNewPeriodMonth(`${selectedYear}-${month}-01`);
                    }}
                  >
                    Create First Week
                  </button>
                )}
              </div>
            )}
          </div>
        )}

      </div>

      {/* Week Stats when a week is selected */}
      {currentPeriod && !isCreatingPeriod && (
        <div className={styles.weekStatsBar}>
          <div className={styles.weekStats}>
            <span className={styles.statItem}>
              <span className={styles.statDot} style={{ background: 'var(--color-success)' }}></span>
              {periodSettlements.filter(s => s.status === 'finalized').length} Finalized
            </span>
            <span className={styles.statItem}>
              <span className={styles.statDot} style={{ background: 'var(--color-warning)' }}></span>
              {periodSettlements.filter(s => s.status === 'draft').length} Draft
            </span>
            <span className={styles.statItem}>
              <span className={styles.statDot} style={{ background: 'var(--text-muted)' }}></span>
              {activeDrivers.length - periodSettlements.length} Pending
            </span>
          </div>
        </div>
      )}

      <div className={styles.workspaceMain}>
        {/* Driver List Sidebar - only show when period is selected */}
        {currentPeriod && (
          <div className={styles.driverSidebar}>
            <div className={styles.sidebarHeader}>
              <div className={styles.driverTabs}>
                <button
                  className={`${styles.tabBtn} ${!showArchived ? styles.active : ''}`}
                  onClick={() => { setShowArchived(false); setSelectedDriverId(null); }}
                >
                  Active ({activeDrivers.length})
                </button>
                <button
                  className={`${styles.tabBtn} ${showArchived ? styles.active : ''}`}
                  onClick={() => { setShowArchived(true); setSelectedDriverId(null); }}
                >
                  Archived ({archivedDrivers.length})
                </button>
              </div>
              <input
                type="text"
                placeholder="Search drivers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
              />
            </div>
            
            <div className={styles.driverList}>
              {displayedDrivers.map(driver => {
                const status = getDriverStatus(driver.id);
                const isSelected = driver.id === selectedDriverId;
                const driverSettlement = periodSettlements.find(s => s.driver_id === driver.id);
                const isPaid = !!driverSettlement?.paid_at;
                
                return (
                  <button
                    key={driver.id}
                    className={`${styles.driverItem} ${isSelected ? styles.selected : ''} ${isPaid ? styles.paid : ''}`}
                    onClick={() => selectDriver(driver.id)}
                  >
                    <span className={styles.driverName}>{driver.full_name}</span>
                    <div className={styles.driverIndicators}>
                      {isPaid && <span className={styles.paidBadge} title="Paid">$</span>}
                      <span className={`${styles.statusIndicator} ${styles[`status_${status}`]}`}>
                        {status === 'finalized' && '✓'}
                        {status === 'draft' && '○'}
                        {status === 'pending' && '–'}
                      </span>
                    </div>
                  </button>
                );
              })}
              {displayedDrivers.length === 0 && (
                <div className={styles.noDrivers}>
                  {searchQuery ? 'No drivers match your search' : 'No drivers found'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Settlement Form */}
        <div className={styles.settlementPanel}>
          {selectedDriverId && selectedDriver ? (
            <>
              {/* Driver Navigation */}
              <div className={styles.driverNav}>
                <button
                  type="button"
                  className={styles.navBtn}
                  onClick={goToPrevDriver}
                  disabled={currentDriverIndex <= 0}
                >
                  ← Previous
                </button>
                <div className={styles.currentDriver}>
                  <h3>{selectedDriver.full_name}</h3>
                  {currentPeriod && <span className={styles.weekLabel}>{currentPeriod.label}</span>}
                </div>
                <button
                  type="button"
                  className={styles.navBtn}
                  onClick={goToNextDriver}
                  disabled={currentDriverIndex >= displayedDrivers.length - 1}
                >
                  Next →
                </button>
              </div>

              {/* Messages */}
              {error && <div className={styles.errorAlert}>{error}</div>}
              {successMessage && <div className={styles.successAlert}>{successMessage}</div>}

              {/* Platform Table */}
              <div className={styles.platformTableWrapper}>
                <table className={styles.platformTable}>
                  <thead>
                    <tr>
                      <th>Platform</th>
                      <th>Gross</th>
                      <th>50%</th>
                      <th>Fee %</th>
                      <th>Fee</th>
                      <th>Net</th>
                      <th>Cash</th>
                      <th>Tips</th>
                      <th>Campaigns</th>
                      <th>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {platformData.map((platform, index) => {
                      const calc = calculation.platforms[index];
                      const platformConfig = PLATFORMS.find(p => p.id === platform.platformId);
                      
                      return (
                        <tr key={platform.platformId}>
                          <td>
                            <span className={styles.platformName}>
                              <span className={styles.platformIcon}>{platformConfig?.icon}</span>
                              {platform.platformName}
                            </span>
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={platform.grossFare}
                              onChange={(e) => handlePlatformChange(index, 'grossFare', e.target.value)}
                              disabled={!isAdmin}
                            />
                          </td>
                          <td className={styles.calculatedValue}>
                            {formatCurrency(calc.fiftyPercent)}
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="100"
                              value={platform.platformFeePercent}
                              onChange={(e) => handlePlatformChange(index, 'platformFeePercent', e.target.value)}
                              disabled={!isAdmin}
                              style={{ width: '50px' }}
                            />
                          </td>
                          <td className={styles.calculatedValue}>
                            {formatCurrency(calc.fee)}
                          </td>
                          <td className={styles.calculatedValue}>
                            {formatCurrency(calc.net)}
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={platform.cashRide}
                              onChange={(e) => handlePlatformChange(index, 'cashRide', e.target.value)}
                              disabled={!isAdmin}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={platform.tips}
                              onChange={(e) => handlePlatformChange(index, 'tips', e.target.value)}
                              disabled={!isAdmin}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={platform.campaigns}
                              onChange={(e) => handlePlatformChange(index, 'campaigns', e.target.value)}
                              disabled={!isAdmin}
                            />
                          </td>
                          <td className={`${styles.balanceValue} ${calc.balance >= 0 ? styles.balancePositive : styles.balanceNegative}`}>
                            {formatCurrency(calc.balance)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Totals Summary */}
              <div className={styles.totalsCompact}>
                <div className={styles.totalItem}>
                  <span>Total Net</span>
                  <span>{formatCurrency(calculation.totalNet)}</span>
                </div>
                <div className={styles.totalItem}>
                  <span>Cash</span>
                  <span>-{formatCurrency(calculation.totalCashRide)}</span>
                </div>
                <div className={styles.totalItem}>
                  <span>Tips</span>
                  <span>+{formatCurrency(calculation.totalTips)}</span>
                </div>
                <div className={styles.totalItem}>
                  <span>Campaigns</span>
                  <span>+{formatCurrency(calculation.totalCampaigns)}</span>
                </div>
                <div className={styles.fssTaxCompact}>
                  <span>FSS/Tax</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={fssTax}
                    onChange={(e) => setFssTax(e.target.value)}
                    disabled={!isAdmin}
                  />
                </div>
                <div className={styles.finalBalanceCompact}>
                  <span>Final Balance</span>
                  <span className={calculation.finalBalance >= 0 ? styles.balancePositive : styles.balanceNegative}>
                    {formatCurrency(calculation.finalBalance)}
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div className={styles.notesSection}>
                <textarea
                  placeholder="Notes (optional)..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={!isAdmin}
                  rows={2}
                />
              </div>

              {/* Actions */}
              {isAdmin && (
                <div className={styles.actionBar}>
                  <div className={styles.actionLeft}>
                    {existingSettlement && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={handleDelete}
                        disabled={loading}
                      >
                        Delete
                      </button>
                    )}
                    {existingSettlement && (
                      <label className={styles.paidCheckbox}>
                        <input
                          type="checkbox"
                          checked={!!existingSettlement.paid_at}
                          onChange={() => togglePaid(existingSettlement.id, !!existingSettlement.paid_at)}
                        />
                        <span>Paid</span>
                        {existingSettlement.paid_at && (
                          <span className={styles.paidDate}>
                            {new Date(existingSettlement.paid_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                          </span>
                        )}
                      </label>
                    )}
                  </div>
                  <div className={styles.actionRight}>
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
              )}
            </>
          ) : !currentPeriod ? (
            <div className={styles.selectPrompt}>
              <div className={styles.promptIcon}>📅</div>
              <h3>Select or Create a Period</h3>
              <p>Choose an existing period from the dropdown or create a new one to start entering settlements</p>
            </div>
          ) : (
            <div className={styles.selectPrompt}>
              <div className={styles.promptIcon}>👈</div>
              <h3>Select a Driver</h3>
              <p>Choose a driver from the list to enter their settlement for {currentPeriod.periodName || currentPeriod.label}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
