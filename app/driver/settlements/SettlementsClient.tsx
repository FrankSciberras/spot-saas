'use client';

import { useState, useMemo } from 'react';
import { PLATFORMS } from '@/lib/config/settlements';
import { formatCurrency } from '@/lib/utils/settlementCalculations';
import type { DriverSettlement, SettlementPlatform } from '@/lib/types/database';
import styles from './driver-settlements.module.css';

interface SettlementWithPlatforms extends DriverSettlement {
  settlement_platforms: SettlementPlatform[];
}

interface SettlementsClientProps {
  settlements: SettlementWithPlatforms[];
}

type FilterMode = 'recent' | 'calendar' | 'all';

function parseDateOnly(value: string): Date {
  const dateStr = value.includes('T') ? value.split('T')[0] : value;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

// Helper to get Monday of a week
function getMonday(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function weekOverlapsSettlement(weekStart: Date, weekEnd: Date, settlement: SettlementWithPlatforms): boolean {
  const start = parseDateOnly(String(settlement.week_start));
  const end = parseDateOnly(String(settlement.week_end));
  return start <= weekEnd && end >= weekStart;
}

function isSettlementPaid(settlement: SettlementWithPlatforms): boolean {
  return Boolean(settlement.paid_at);
}

export default function SettlementsClient({ settlements: allSettlements }: SettlementsClientProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>('recent');
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    if (allSettlements.length > 0) {
      return parseDateOnly(String(allSettlements[0].week_start));
    }
    return new Date();
  });

  // Filter settlements based on current filter
  const settlements = useMemo(() => {
    if (filterMode === 'recent') {
      return allSettlements.slice(0, 8);
    } else if (filterMode === 'calendar' && selectedWeekId) {
      const found = allSettlements.find(s => s.id === selectedWeekId);
      return found ? [found] : [];
    }
    return allSettlements;
  }, [allSettlements, filterMode, selectedWeekId]);

  // Handle filter mode change
  const handleFilterChange = (mode: FilterMode) => {
    setFilterMode(mode);
    if (mode === 'calendar') {
      setShowCalendar(true);
      if (!selectedWeekId && allSettlements.length > 0) {
        setSelectedWeekId(allSettlements[0].id);
      }
    } else {
      setShowCalendar(false);
    }
  };

  // Handle week selection from calendar
  const handleWeekSelect = (settlementId: string) => {
    setSelectedWeekId(settlementId);
    setShowCalendar(false);
  };

  // Generate calendar data for current month
  const calendarData = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    
    // Get the Monday of the first week
    const startDate = getMonday(firstDay);
    
    const weeks: { dates: Date[]; settlement: SettlementWithPlatforms | null }[] = [];
    let currentDate = new Date(startDate);
    
    // Generate 6 weeks max
    for (let w = 0; w < 6; w++) {
      const weekDates: Date[] = [];
      const weekStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());

      for (let d = 0; d < 7; d++) {
        weekDates.push(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()));
        currentDate.setDate(currentDate.getDate() + 1);
      }

      const weekEnd = new Date(weekDates[6].getFullYear(), weekDates[6].getMonth(), weekDates[6].getDate());
      const weekSettlement = allSettlements.find(s => weekOverlapsSettlement(weekStart, weekEnd, s)) || null;

      weeks.push({ dates: weekDates, settlement: weekSettlement });
    }
    
    return weeks;
  }, [calendarMonth, allSettlements]);

  // Navigate months
  const prevMonth = () => {
    setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };
  
  const nextMonth = () => {
    setCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Get platform icon
  const getPlatformIcon = (platformId: string) => {
    return PLATFORMS.find(p => p.id === platformId)?.icon || '📊';
  };

  // Get the most recent settlement for the balance card
  const latestSettlement = allSettlements[0];

  // Calculate totals for filtered settlements
  const totals = useMemo(() => {
    return settlements.reduce((acc, s) => ({
      earnings: acc.earnings + s.total_net,
      balance: acc.balance + s.final_balance,
    }), { earnings: 0, balance: 0 });
  }, [settlements]);

  return (
    <div className={styles.container}>
      {/* Latest Balance Card */}
      {latestSettlement && (
        <div className={styles.balanceCard}>
          <div className={styles.balanceHeader}>
            <span className={styles.balanceLabel}>Latest Weekly Balance</span>
            <span className={styles.balanceWeek}>{latestSettlement.week_label}</span>
          </div>
          <div className={styles.balanceAmount}>
            {formatCurrency(latestSettlement.final_balance)}
          </div>
          <div className={styles.balanceBreakdown}>
            <div className={styles.breakdownItem}>
              <span>Total Earnings</span>
              <span>{formatCurrency(latestSettlement.total_gross_fare)}</span>
            </div>
            <div className={styles.breakdownItem}>
              <span>Your Net</span>
              <span>{formatCurrency(latestSettlement.total_net)}</span>
            </div>
            <div className={styles.breakdownItem}>
              <span>FSS/Tax</span>
              <span>-{formatCurrency(latestSettlement.fss_tax)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Filter Section */}
      <div className={styles.filterSection}>
        <div className={styles.filterRow}>
          <div className={styles.filterButtons}>
            <button
              className={`${styles.filterBtn} ${filterMode === 'recent' ? styles.active : ''}`}
              onClick={() => handleFilterChange('recent')}
            >
              Recent
            </button>
            <button
              className={`${styles.filterBtn} ${filterMode === 'calendar' ? styles.active : ''}`}
              onClick={() => {
                if (filterMode === 'calendar') {
                  setShowCalendar(v => !v);
                } else {
                  handleFilterChange('calendar');
                }
              }}
            >
              Pick Week
            </button>
            <button
              className={`${styles.filterBtn} ${filterMode === 'all' ? styles.active : ''}`}
              onClick={() => handleFilterChange('all')}
            >
              All Time
            </button>
          </div>

        </div>

        {/* Calendar Picker */}
        {showCalendar && (
          <div className={styles.calendarPicker}>
            {/* Month Navigation */}
            <div className={styles.calendarNav}>
              <span className={styles.calendarMonthLabel}>
                {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              <div className={styles.calendarNavBtns}>
                <button onClick={prevMonth} className={styles.calendarNavBtn}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 18l-6-6 6-6"/>
                  </svg>
                </button>
                <button onClick={nextMonth} className={styles.calendarNavBtn}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Day Headers */}
            <div className={styles.calendarDayHeaders}>
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(day => (
                <span key={day} className={styles.calendarDayHeader}>{day}</span>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className={styles.calendarGrid}>
              {calendarData.map((week, weekIndex) => (
                <div 
                  key={weekIndex} 
                  className={`${styles.calendarWeekRow} ${week.settlement ? (isSettlementPaid(week.settlement) ? styles.hasPaidSettlement : styles.hasUnpaidSettlement) : ''} ${week.settlement?.id === selectedWeekId ? styles.selected : ''}`}
                  onClick={() => week.settlement && handleWeekSelect(week.settlement.id)}
                >
                  {week.dates.map((date, dayIndex) => {
                    const isCurrentMonth = date.getMonth() === calendarMonth.getMonth();
                    const isToday = date.toDateString() === new Date().toDateString();
                    const isStartDay = dayIndex === 0 && week.settlement;
                    const isEndDay = dayIndex === 6 && week.settlement;
                    
                    return (
                      <span 
                        key={dayIndex} 
                        className={`${styles.calendarDay} ${!isCurrentMonth ? styles.otherMonth : ''} ${isToday ? styles.today : ''} ${isStartDay ? styles.weekStart : ''} ${isEndDay ? styles.weekEnd : ''}`}
                      >
                        {date.getDate()}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter Summary */}
        <div className={styles.filterSummary}>
          <span>{settlements.length} settlement{settlements.length !== 1 ? 's' : ''}</span>
          {settlements.length > 0 && (
            <span className={styles.filterTotal}>
              Total: {formatCurrency(totals.balance)}
            </span>
          )}
        </div>
      </div>

      {/* Settlements History */}
      <div className={styles.historySection}>
        <h2>Settlement History</h2>
        
        {settlements.length === 0 ? (
          <div className={styles.emptyState}>
            <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" fill="none">
              <path d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
            </svg>
            <h3>No settlements found</h3>
            <p>Your weekly settlements will appear here once they are finalized.</p>
          </div>
        ) : (
          <div className={styles.settlementsList}>
            {settlements.map(settlement => (
              <div key={settlement.id} className={styles.settlementCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.weekInfo}>
                    <span className={styles.weekLabel}>{settlement.week_label}</span>
                    {settlement.period_name && (
                      <span className={styles.periodName}>{settlement.period_name}</span>
                    )}
                  </div>
                  <div className={styles.headerRight}>
                    <span className={`${styles.paymentBadge} ${isSettlementPaid(settlement) ? styles.paid : styles.unpaid}`}>
                      {isSettlementPaid(settlement) ? 'Paid' : 'Unpaid'}
                    </span>
                    <span className={`${styles.finalBalance} ${settlement.final_balance >= 0 ? styles.positive : styles.negative}`}>
                      {formatCurrency(settlement.final_balance)}
                    </span>
                  </div>
                </div>

                {/* Platform breakdown */}
                <div className={styles.platformsList}>
                  {settlement.settlement_platforms.map(platform => (
                    <div key={platform.id} className={styles.platformRow}>
                      <span className={styles.platformName}>
                        <span className={styles.platformIcon}>
                          {getPlatformIcon(platform.platform_id)}
                        </span>
                        {platform.platform_name}
                      </span>
                      <div className={styles.platformValues}>
                        <span className={styles.platformGross}>
                          Gross: {formatCurrency(platform.gross_fare)}
                        </span>
                        <span className={styles.platformBalance}>
                          {formatCurrency(platform.balance)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary */}
                <div className={styles.cardSummary}>
                  <div className={styles.summaryRow}>
                    <span>Total Net</span>
                    <span>{formatCurrency(settlement.total_net)}</span>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Cash Collected</span>
                    <span>-{formatCurrency(
                      settlement.settlement_platforms.reduce((sum, p) => sum + p.cash_ride, 0)
                    )}</span>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Tips</span>
                    <span>+{formatCurrency(
                      settlement.settlement_platforms.reduce((sum, p) => sum + p.tips, 0)
                    )}</span>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Campaigns</span>
                    <span>+{formatCurrency(
                      settlement.settlement_platforms.reduce((sum, p) => sum + (p.campaigns || 0), 0)
                    )}</span>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>FSS/Tax</span>
                    <span>-{formatCurrency(settlement.fss_tax)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
