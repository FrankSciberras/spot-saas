'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DriverAdjustment, DriverSettlement, SettlementPlatform } from '@/lib/types/database';
import { formatCurrency } from '@/lib/utils/settlementCalculations';
import { exportDriverMonthlySettlementPdf } from '@/lib/utils/settlementPdfExport';
import styles from './driver-settlements.module.css';

interface SettlementWithPlatforms extends DriverSettlement {
  settlement_platforms: SettlementPlatform[];
}

type MonthTotals = {
  weeksCount: number;
  paidWeeksCount: number;
  totalGrossFare: number;
  totalNet: number;
  totalFssTax: number;
  totalFinalBalance: number;
  totalCashRide: number;
  totalTips: number;
  totalCampaigns: number;
};

function dateOnly(value: string): string {
  return value.includes('T') ? value.split('T')[0] : value;
}

function parseDateOnly(value: string): Date {
  const only = dateOnly(value);
  const [y, m, d] = only.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function isSettlementPaid(settlement: SettlementWithPlatforms): boolean {
  return Boolean(settlement.paid_at);
}

function signedAdjustmentAmount(type: DriverAdjustment['type'], amount: number): number {
  if (type === 'expense' || type === 'deduction') return -amount;
  if (type === 'bonus' || type === 'reimbursement') return amount;
  return 0;
}

export default function MonthlySettlementsClient({
  settlements: allSettlements,
  driverName,
}: {
  settlements: SettlementWithPlatforms[];
  driverName: string;
}) {
  const monthNames = useMemo(
    () => [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ],
    []
  );

  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | null>(() => new Date().getMonth());
  const [expandedWeekIds, setExpandedWeekIds] = useState<Set<string>>(() => new Set());
  const [yearAdjustments, setYearAdjustments] = useState<DriverAdjustment[]>([]);
  const [adjustmentsLoading, setAdjustmentsLoading] = useState(false);

  const yearSettlements = useMemo(() => {
    return allSettlements.filter(s => {
      const monthDate = s.settlement_month ? new Date(s.settlement_month) : new Date(s.week_start);
      return monthDate.getFullYear() === selectedYear;
    });
  }, [allSettlements, selectedYear]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    years.add(new Date().getFullYear());

    allSettlements.forEach(s => {
      const monthDate = s.settlement_month ? new Date(s.settlement_month) : new Date(s.week_start);
      years.add(monthDate.getFullYear());
    });

    return Array.from(years).sort((a, b) => b - a);
  }, [allSettlements]);

  const monthsWithData = useMemo(() => {
    const months = new Map<number, MonthTotals>();
    for (let i = 0; i < 12; i++) {
      months.set(i, {
        weeksCount: 0,
        paidWeeksCount: 0,
        totalGrossFare: 0,
        totalNet: 0,
        totalFssTax: 0,
        totalFinalBalance: 0,
        totalCashRide: 0,
        totalTips: 0,
        totalCampaigns: 0,
      });
    }

    yearSettlements.forEach(s => {
      const monthDate = s.settlement_month ? new Date(s.settlement_month) : new Date(s.week_start);
      const monthIdx = monthDate.getMonth();
      const cur = months.get(monthIdx);
      if (!cur) return;

      const cashRide = (s.settlement_platforms || []).reduce((sum, p) => sum + (p.cash_ride || 0), 0);
      const tips = (s.settlement_platforms || []).reduce((sum, p) => sum + (p.tips || 0), 0);
      const campaigns = (s.settlement_platforms || []).reduce((sum, p) => sum + (p.campaigns || 0), 0);

      months.set(monthIdx, {
        weeksCount: cur.weeksCount + 1,
        paidWeeksCount: cur.paidWeeksCount + (isSettlementPaid(s) ? 1 : 0),
        totalGrossFare: cur.totalGrossFare + (s.total_gross_fare || 0),
        totalNet: cur.totalNet + (s.total_net || 0),
        totalFssTax: cur.totalFssTax + (s.fss_tax || 0),
        totalFinalBalance: cur.totalFinalBalance + (s.final_balance || 0),
        totalCashRide: cur.totalCashRide + cashRide,
        totalTips: cur.totalTips + tips,
        totalCampaigns: cur.totalCampaigns + campaigns,
      });
    });

    return months;
  }, [selectedYear, yearSettlements]);

  useEffect(() => {
    if (selectedMonth === null) return;
    const current = monthsWithData.get(selectedMonth);
    if (current && current.weeksCount > 0) return;

    const months = Array.from(monthsWithData.entries())
      .filter(([, v]) => v.weeksCount > 0)
      .map(([k]) => k)
      .sort((a, b) => b - a);

    if (months.length > 0) {
      setSelectedMonth(months[0]);
    }
  }, [monthsWithData, selectedMonth]);

  const monthSettlements = useMemo(() => {
    if (selectedMonth === null) return [];

    return yearSettlements
      .filter(s => {
        const monthDate = s.settlement_month ? new Date(s.settlement_month) : new Date(s.week_start);
        return monthDate.getFullYear() === selectedYear && monthDate.getMonth() === selectedMonth;
      })
      .sort((a, b) => new Date(b.week_start).getTime() - new Date(a.week_start).getTime());
  }, [selectedMonth, selectedYear, yearSettlements]);

  const monthLabel = useMemo(() => {
    if (selectedMonth === null) return '';
    return `${monthNames[selectedMonth]} ${selectedYear}`;
  }, [monthNames, selectedMonth, selectedYear]);

  useEffect(() => {
    async function loadYearAdjustments() {
      setAdjustmentsLoading(true);
      try {
        if (yearSettlements.length === 0) {
          setYearAdjustments([]);
          return;
        }

        const starts = yearSettlements.map(s => dateOnly(s.week_start));
        const ends = yearSettlements.map(s => dateOnly(s.week_end));
        const fromDate = starts.reduce((min, cur) => (cur < min ? cur : min), starts[0]);
        const toDate = ends.reduce((max, cur) => (cur > max ? cur : max), ends[0]);

        const res = await fetch(
          `/api/adjustments?from_date=${encodeURIComponent(fromDate)}&to_date=${encodeURIComponent(toDate)}`
        );
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || 'Failed to load deductions');
        }

        const adjustments = Array.isArray(json.data) ? (json.data as DriverAdjustment[]) : [];
        setYearAdjustments(adjustments);
      } catch {
        setYearAdjustments([]);
      } finally {
        setAdjustmentsLoading(false);
      }
    }

    loadYearAdjustments();
  }, [selectedYear, yearSettlements]);

  const adjustmentAssignment = useMemo(() => {
    // Group by the FROZEN settlement_id link (set when a settlement was saved),
    // not a live date match — so an adjustment always shows under the exact
    // settlement that priced it, and editing it can't re-bucket old records.
    const settlementIds = new Set(yearSettlements.map(s => s.id));
    const assignedBySettlementId = new Map<string, DriverAdjustment[]>();
    const unassigned: DriverAdjustment[] = [];

    yearAdjustments.forEach(adj => {
      if (adj.settlement_id && settlementIds.has(adj.settlement_id)) {
        const list = assignedBySettlementId.get(adj.settlement_id) || [];
        list.push(adj);
        assignedBySettlementId.set(adj.settlement_id, list);
      } else {
        unassigned.push(adj);
      }
    });

    return {
      assignedBySettlementId,
      unassigned,
    };
  }, [yearAdjustments, yearSettlements]);

  const monthAdjustments = useMemo(() => {
    if (selectedMonth === null) return [];
    const list: DriverAdjustment[] = [];
    monthSettlements.forEach(s => {
      const assigned = adjustmentAssignment.assignedBySettlementId.get(s.id) || [];
      list.push(...assigned);
    });
    return list;
  }, [adjustmentAssignment.assignedBySettlementId, monthSettlements, selectedMonth]);

  const unassignedMonthAdjustments = useMemo(() => {
    if (selectedMonth === null) return [];
    return adjustmentAssignment.unassigned.filter(adj => {
      const d = new Date(dateOnly(adj.date));
      if (Number.isNaN(d.getTime())) return false;
      return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
    });
  }, [adjustmentAssignment.unassigned, selectedMonth, selectedYear]);

  // The money figure is the FROZEN snapshot stored on each settlement, so it
  // never drifts if a linked adjustment is later edited. (The itemized
  // monthAdjustments list is shown for detail only.)
  const monthAdjustmentsNet = useMemo(() => {
    return monthSettlements.reduce((sum, s) => sum + (s.total_adjustments ?? 0), 0);
  }, [monthSettlements]);

  const adjustmentsNetByMonth = useMemo(() => {
    const map = new Map<number, number>();
    for (let i = 0; i < 12; i++) map.set(i, 0);

    yearSettlements.forEach(s => {
      const monthDate = s.settlement_month ? new Date(s.settlement_month) : new Date(s.week_start);
      const month = monthDate.getMonth();
      const cur = map.get(month) || 0;
      map.set(month, cur + (s.total_adjustments ?? 0));
    });

    return map;
  }, [selectedYear, yearSettlements]);

  const monthPlatformTotals = useMemo(() => {
    const map = new Map<
      string,
      {
        platformName: string;
        gross: number;
        net: number;
        cash: number;
        tips: number;
        campaigns: number;
        balance: number;
      }
    >();

    monthSettlements.forEach(s => {
      (s.settlement_platforms || []).forEach(p => {
        const key = p.platform_id || p.platform_name;
        const cur = map.get(key) || {
          platformName: p.platform_name,
          gross: 0,
          net: 0,
          cash: 0,
          tips: 0,
          campaigns: 0,
          balance: 0,
        };

        cur.gross += p.gross_fare || 0;
        cur.net += p.net || 0;
        cur.cash += p.cash_ride || 0;
        cur.tips += p.tips || 0;
        cur.campaigns += p.campaigns || 0;
        cur.balance += p.balance || 0;
        map.set(key, cur);
      });
    });

    return Array.from(map.values()).sort((a, b) => a.platformName.localeCompare(b.platformName));
  }, [monthSettlements]);

  const monthTotals = useMemo(() => {
    return monthSettlements.reduce(
      (acc, s) => {
        const cashRide = (s.settlement_platforms || []).reduce((sum, p) => sum + (p.cash_ride || 0), 0);
        const tips = (s.settlement_platforms || []).reduce((sum, p) => sum + (p.tips || 0), 0);
        const campaigns = (s.settlement_platforms || []).reduce((sum, p) => sum + (p.campaigns || 0), 0);

        return {
          totalGrossFare: acc.totalGrossFare + (s.total_gross_fare || 0),
          totalNet: acc.totalNet + (s.total_net || 0),
          totalFssTax: acc.totalFssTax + (s.fss_tax || 0),
          totalFinalBalance: acc.totalFinalBalance + (s.final_balance || 0),
          totalCashRide: acc.totalCashRide + cashRide,
          totalTips: acc.totalTips + tips,
          totalCampaigns: acc.totalCampaigns + campaigns,
        };
      },
      {
        totalGrossFare: 0,
        totalNet: 0,
        totalFssTax: 0,
        totalFinalBalance: 0,
        totalCashRide: 0,
        totalTips: 0,
        totalCampaigns: 0,
      }
    );
  }, [monthSettlements]);

  const payableTotal = useMemo(() => {
    return monthTotals.totalFinalBalance + monthAdjustmentsNet;
  }, [monthAdjustmentsNet, monthTotals.totalFinalBalance]);

  const toggleWeek = useCallback((id: string) => {
    setExpandedWeekIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleExportPdf = useCallback(() => {
    if (selectedMonth === null || monthSettlements.length === 0) return;

    exportDriverMonthlySettlementPdf({
      driverName,
      monthLabel,
      settlements: monthSettlements.map(s => ({
        weekStart: s.week_start,
        weekLabel: s.week_label,
        periodName: s.period_name,
        status: s.status,
        paidAt: s.paid_at,
        totalGrossFare: s.total_gross_fare,
        totalNet: s.total_net,
        fssTax: s.fss_tax,
        finalBalance: s.final_balance,
        platforms: s.settlement_platforms || [],
      })),
      driverAdjustments: monthAdjustments,
    });
  }, [driverName, monthAdjustments, monthLabel, monthSettlements, selectedMonth]);

  if (allSettlements.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" fill="none">
            <path d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
          </svg>
          <h3>No settlements found</h3>
          <p>Your settlements will appear here once they are finalized.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.monthsHeader}>
        <div className={styles.yearRow}>
          <select
            className={styles.yearSelect}
            value={selectedYear}
            onChange={(e) => {
              const y = Number(e.target.value);
              setSelectedYear(y);
            }}
          >
            {availableYears.map(y => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <div className={styles.driverName}>{driverName}</div>
        </div>

        <div className={styles.monthsGrid}>
          {monthNames.map((name, idx) => {
            const totals = monthsWithData.get(idx);
            const count = totals?.weeksCount || 0;
            const isActive = selectedMonth === idx;
            const disabled = count === 0;
            const payable = (totals?.totalFinalBalance || 0) + (adjustmentsNetByMonth.get(idx) || 0);

            return (
              <button
                key={name}
                className={`${styles.monthTile} ${isActive ? styles.monthTileActive : ''} ${disabled ? styles.monthTileDisabled : ''}`}
                onClick={() => {
                  if (!disabled) setSelectedMonth(idx);
                }}
                type="button"
              >
                <div className={styles.monthTileTop}>
                  <span className={styles.monthTileName}>{name.slice(0, 3)}</span>
                  <span className={styles.monthTileWeeks}>{count}/4</span>
                </div>
                <div className={styles.monthTileAmount}>
                  {count === 0 ? '-' : formatCurrency(payable)}
                </div>
                <div className={styles.monthTileMeta}>
                  {count === 0
                    ? 'No data'
                    : `${totals?.paidWeeksCount || 0}/${totals?.weeksCount || 0} paid`}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedMonth !== null && (
        <div className={styles.monthDetail}>
          <div className={styles.monthDetailHeader}>
            <div>
              <div className={styles.monthTitle}>{monthLabel}</div>
              <div className={styles.monthSubTitle}>
                {monthSettlements.length} week{monthSettlements.length !== 1 ? 's' : ''}
              </div>
            </div>
            <button
              className={styles.exportBtn}
              onClick={handleExportPdf}
              disabled={monthSettlements.length === 0}
              type="button"
            >
              Export PDF
            </button>
          </div>

          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Gross</div>
              <div className={styles.statValue}>{formatCurrency(monthTotals.totalGrossFare)}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Tips</div>
              <div className={styles.statValue}>+{formatCurrency(monthTotals.totalTips)}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Campaigns</div>
              <div className={styles.statValue}>+{formatCurrency(monthTotals.totalCampaigns)}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Cash collected</div>
              <div className={styles.statValue}>-{formatCurrency(monthTotals.totalCashRide)}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>FSS/Tax</div>
              <div className={styles.statValue}>-{formatCurrency(monthTotals.totalFssTax)}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Net</div>
              <div className={styles.statValue}>{formatCurrency(monthTotals.totalNet)}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Final</div>
              <div className={styles.statValue}>{formatCurrency(monthTotals.totalFinalBalance)}</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Adjustments</div>
              <div className={styles.statValue}>
                {monthAdjustmentsNet >= 0 ? '+' : '-'}
                {formatCurrency(Math.abs(monthAdjustmentsNet))}
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Payable</div>
              <div className={styles.statValue}>{formatCurrency(payableTotal)}</div>
            </div>
          </div>

          <div className={styles.sectionCard}>
            <div className={styles.sectionTitle}>Platforms</div>
            {monthPlatformTotals.length === 0 ? (
              <div className={styles.sectionEmpty}>No platform data</div>
            ) : (
              <div className={styles.platformTotalsTable}>
                {monthPlatformTotals.map(p => (
                  <div key={p.platformName} className={styles.platformTotalsRow}>
                    <div className={styles.platformTotalsName}>{p.platformName}</div>
                    <div className={styles.platformTotalsValues}>
                      <span className={styles.platformTotalsSmall}>Gross {formatCurrency(p.gross)}</span>
                      <span className={styles.platformTotalsSmall}>Net {formatCurrency(p.net)}</span>
                      <span className={styles.platformTotalsSmall}>Cash {formatCurrency(p.cash)}</span>
                      <span className={styles.platformTotalsSmall}>Tips {formatCurrency(p.tips)}</span>
                      <span className={styles.platformTotalsSmall}>Camp {formatCurrency(p.campaigns)}</span>
                      <span className={styles.platformTotalsBalance}>{formatCurrency(p.balance)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.sectionCard}>
            <div className={styles.sectionTitle}>Weeks</div>
            <div className={styles.weeksList}>
              {monthSettlements.map(s => {
                const expanded = expandedWeekIds.has(s.id);
                return (
                  <div key={s.id} className={styles.weekCard}>
                    <button
                      className={styles.weekHeader}
                      onClick={() => toggleWeek(s.id)}
                      type="button"
                    >
                      <div className={styles.weekHeaderLeft}>
                        <div className={styles.weekHeaderTitle}>{s.week_label}</div>
                        {s.period_name ? <div className={styles.weekHeaderSub}>{s.period_name}</div> : null}
                      </div>
                      <div className={styles.weekHeaderRight}>
                        <span className={`${styles.paymentBadge} ${isSettlementPaid(s) ? styles.paid : styles.unpaid}`}>
                          {isSettlementPaid(s) ? 'Paid' : 'Unpaid'}
                        </span>
                        <div className={styles.weekHeaderAmount}>{formatCurrency(s.final_balance + (s.total_adjustments ?? 0))}</div>
                        <div className={styles.expandIcon}>{expanded ? '−' : '+'}</div>
                      </div>
                    </button>

                    {expanded && (
                      <div className={styles.weekBody}>
                        <div className={styles.weekBodyGrid}>
                          <div className={styles.weekMiniStat}>
                            <span>Gross</span>
                            <span>{formatCurrency(s.total_gross_fare)}</span>
                          </div>
                          <div className={styles.weekMiniStat}>
                            <span>Net</span>
                            <span>{formatCurrency(s.total_net)}</span>
                          </div>
                          {(s.wage_amount ?? 0) > 0 && (
                            <div className={styles.weekMiniStat}>
                              <span>Wage{(s.hours_worked ?? 0) > 0 ? ` (${s.hours_worked}h)` : ''}</span>
                              <span>+{formatCurrency(s.wage_amount)}</span>
                            </div>
                          )}
                          <div className={styles.weekMiniStat}>
                            <span>FSS/Tax</span>
                            <span>-{formatCurrency(s.fss_tax)}</span>
                          </div>
                          {(s.rent_amount ?? 0) > 0 && (
                            <div className={styles.weekMiniStat}>
                              <span>Rent</span>
                              <span>-{formatCurrency(s.rent_amount)}</span>
                            </div>
                          )}
                          {(s.total_adjustments ?? 0) !== 0 && (
                            <div className={styles.weekMiniStat}>
                              <span>Adjustments</span>
                              <span>
                                {(s.total_adjustments ?? 0) >= 0 ? '+' : '-'}
                                {formatCurrency(Math.abs(s.total_adjustments ?? 0))}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className={styles.weekPlatforms}>
                          {(s.settlement_platforms || []).map(p => (
                            <div key={p.id} className={styles.weekPlatformRow}>
                              <div className={styles.weekPlatformName}>{p.platform_name}</div>
                              <div className={styles.weekPlatformValues}>
                                <span>Gross {formatCurrency(p.gross_fare)}</span>
                                <span>Net {formatCurrency(p.net)}</span>
                                <span>Cash {formatCurrency(p.cash_ride)}</span>
                                <span>Tips {formatCurrency(p.tips)}</span>
                                <span>Camp {formatCurrency(p.campaigns || 0)}</span>
                                <strong>{formatCurrency(p.balance)}</strong>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.sectionCard}>
            <div className={styles.sectionTitle}>Deductions</div>
            {adjustmentsLoading ? (
              <div className={styles.sectionEmpty}>Loading...</div>
            ) : monthAdjustments.length === 0 ? (
              <div className={styles.sectionEmpty}>No deductions for this month</div>
            ) : (
              <div className={styles.adjustmentsList}>
                {monthAdjustments
                  .slice()
                  .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
                  .map(adj => {
                    const signed = signedAdjustmentAmount(adj.type, Number(adj.amount) || 0);
                    return (
                      <div key={adj.id} className={styles.adjustmentRow}>
                        <div className={styles.adjustmentLeft}>
                          <div className={styles.adjustmentDesc}>{adj.description}</div>
                          <div className={styles.adjustmentMeta}>
                            {dateOnly(adj.date)} · {adj.type}
                          </div>
                        </div>
                        <div className={`${styles.adjustmentAmount} ${signed >= 0 ? styles.adjustmentPositive : styles.adjustmentNegative}`}>
                          {signed >= 0 ? '+' : '-'}{formatCurrency(Math.abs(signed))}
                        </div>
                      </div>
                    );
                  })}

                <div className={styles.adjustmentTotalRow}>
                  <span>Total</span>
                  <span className={`${styles.adjustmentAmount} ${monthAdjustmentsNet >= 0 ? styles.adjustmentPositive : styles.adjustmentNegative}`}>
                    {monthAdjustmentsNet >= 0 ? '+' : '-'}{formatCurrency(Math.abs(monthAdjustmentsNet))}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className={styles.sectionCard}>
            <div className={styles.sectionTitle}>Unassigned</div>
            <div className={styles.sectionEmpty}>
              These don’t fall within any finalized settlement week yet, so they don’t affect your payable.
            </div>

            {adjustmentsLoading ? (
              <div className={styles.sectionEmpty}>Loading...</div>
            ) : unassignedMonthAdjustments.length === 0 ? (
              <div className={styles.sectionEmpty}>No unassigned items for this month</div>
            ) : (
              <div className={styles.adjustmentsList}>
                {unassignedMonthAdjustments
                  .slice()
                  .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
                  .map(adj => {
                    const signed = signedAdjustmentAmount(adj.type, Number(adj.amount) || 0);
                    return (
                      <div key={adj.id} className={styles.adjustmentRow}>
                        <div className={styles.adjustmentLeft}>
                          <div className={styles.adjustmentDesc}>{adj.description}</div>
                          <div className={styles.adjustmentMeta}>
                            {dateOnly(adj.date)} · {adj.type}
                          </div>
                        </div>
                        <div className={`${styles.adjustmentAmount} ${signed >= 0 ? styles.adjustmentPositive : styles.adjustmentNegative}`}>
                          {signed >= 0 ? '+' : '-'}{formatCurrency(Math.abs(signed))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
