'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Driver, DriverAdjustment, DriverSettlement, SettlementPlatform, BookkeepingPeriodWithEntries } from '@/lib/types/database';
import type { FinanceCategory } from '@/lib/config/financeCategories';
import { buildBookkeepingTxns, toQuickBooksCsv, toXeroCsv } from '@/lib/utils/accountingExport';
import { splitAcrossMonths } from '@/lib/utils/bookkeepingPeriods';
import DatePicker from '@/components/shared/DatePicker';
import styles from './FinancialsDashboard.module.css';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

type GroupBy = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
type GroupByWithAllTime = GroupBy | 'all_time';
type DashboardMode = 'fleet' | 'drivers';

type DriverListItem = Pick<Driver, 'id' | 'full_name' | 'status'>;

type SettlementWithRelations = DriverSettlement & {
  drivers?: Pick<Driver, 'id' | 'full_name'> & { status: string } | null;
  settlement_platforms?: SettlementPlatform[];
};

interface FinancialsDashboardProps {
  periods: BookkeepingPeriodWithEntries[];
  categories: FinanceCategory[];
  drivers: DriverListItem[];
  settlements: SettlementWithRelations[];
}

/**
 * Amounts keyed by finance-category id.
 *
 * This used to be two fixed-shape objects listing the twelve hardcoded
 * columns, which meant every new category needed edits in eight places in this
 * file alone. Categories are per-fleet data now, so the breakdowns are open.
 */
type CategoryTotals = Record<string, number>;

interface AggregatedPeriod {
  key: string;
  label: string;
  start: string;
  end: string;
  income: CategoryTotals;
  expenses: CategoryTotals;
  total_income: number;
  total_expenses: number;
  net_profit: number;
}

interface DriverAggregatedPeriod {
  key: string;
  label: string;
  start: string;
  end: string;
  income: CategoryTotals;
  total_gross: number;
  total_net: number;
  total_payout: number;
  total_fss_tax: number;
  settlement_count: number;
}

function safeIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatCurrencyEUR(value: number): string {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(value);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function parseISO(dateStr: string): Date {
  return new Date(`${dateStr.split('T')[0]}T00:00:00`);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function getQuarter(d: Date): 1 | 2 | 3 | 4 {
  return (Math.floor(d.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
}

function formatShortDate(dateStr: string): string {
  const d = parseISO(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

function initTotals(): CategoryTotals {
  return {};
}

/** Add b into a, key by key. Missing keys count as zero. */
function mergeTotals(a: CategoryTotals, b: CategoryTotals): CategoryTotals {
  const out: CategoryTotals = { ...a };
  for (const [key, value] of Object.entries(b)) {
    out[key] = (out[key] || 0) + value;
  }
  return out;
}

/** Add one amount to a single category, tolerating an unknown key. */
function addTo(totals: CategoryTotals, categoryId: string | null | undefined, value: number): CategoryTotals {
  if (!categoryId || !value) return totals;
  return { ...totals, [categoryId]: (totals[categoryId] || 0) + value };
}

/** Scale every line — used to weight a period across the months it spans. */
function scaleTotals(totals: CategoryTotals, factor: number): CategoryTotals {
  if (factor === 1) return totals;
  const out: CategoryTotals = {};
  for (const [key, value] of Object.entries(totals)) {
    out[key] = value * factor;
  }
  return out;
}

/**
 * Map a settlement's platform_id onto an income category.
 *
 * Driver-mode income comes from settlement_platforms, whose platform_id is a
 * per-fleet slug ('uber'), while the seeded income categories use the old
 * column names ('uber_earnings'). Try both, then fall back to the "Other"
 * income catch-all so a custom platform's money is never silently dropped.
 */
function buildPlatformCategoryMap(categories: FinanceCategory[]): (platformId: string | null | undefined) => string | null {
  const incomeByKey = new Map<string, string>();
  let fallback: string | null = null;

  for (const category of categories) {
    if (category.kind !== 'income') continue;
    incomeByKey.set(category.key.toLowerCase(), category.id);
    if (category.isSystem) fallback = category.id;
  }
  if (!fallback) {
    fallback = categories.find((c) => c.kind === 'income')?.id ?? null;
  }

  return (platformId) => {
    const key = (platformId || '').toLowerCase();
    if (!key) return fallback;
    return incomeByKey.get(key) ?? incomeByKey.get(`${key}_earnings`) ?? fallback;
  };
}

function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string): string {
  const needsQuotes = /[",\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function toCsv(rows: Array<Record<string, string | number>>): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(
      headers
        .map((h) => {
          const v = row[h];
          return csvEscape(typeof v === 'number' ? String(v) : v);
        })
        .join(',')
    );
  }
  return lines.join('\n');
}

function signedAdjustmentAmount(type: DriverAdjustment['type'], amount: number): number {
  if (type === 'expense' || type === 'deduction') return -amount;
  if (type === 'bonus' || type === 'reimbursement') return amount;
  return 0;
}

function calculateAdjustmentsNet(adjustments: DriverAdjustment[]): number {
  return adjustments.reduce((sum, adj) => sum + signedAdjustmentAmount(adj.type, Number(adj.amount) || 0), 0);
}

export default function FinancialsDashboard({ periods, categories, drivers, settlements }: FinancialsDashboardProps) {
  const [mode, setMode] = useState<DashboardMode>('fleet');

  const [selectedDriverId, setSelectedDriverId] = useState<string>('all');

  const incomeCategories = useMemo(
    () => categories.filter((c) => c.kind === 'income').sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  );
  const expenseCategories = useMemo(
    () => categories.filter((c) => c.kind === 'expense').sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  );
  const categoryById = useMemo(() => {
    const map = new Map<string, FinanceCategory>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);
  const platformToCategory = useMemo(() => buildPlatformCategoryMap(categories), [categories]);

  const sortedEntries = useMemo(() => {
    return [...periods].sort((a, b) => parseISO(a.start_date).getTime() - parseISO(b.start_date).getTime());
  }, [periods]);

  const sortedSettlements = useMemo(() => {
    return [...settlements].sort((a, b) => parseISO(a.week_start).getTime() - parseISO(b.week_start).getTime());
  }, [settlements]);

  const bookkeepingRange = useMemo(() => {
    const today = new Date();
    const end = safeIso(today);
    const start = safeIso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 365));

    const first = sortedEntries[0]?.start_date?.split('T')[0];
    const last = sortedEntries[sortedEntries.length - 1]?.end_date?.split('T')[0];

    return {
      start: first ?? start,
      end: last ?? end,
    };
  }, [sortedEntries]);

  const settlementsRange = useMemo(() => {
    const today = new Date();
    const end = safeIso(today);
    const start = safeIso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 365));

    const first = sortedSettlements[0]?.week_start?.split('T')[0];
    const last = sortedSettlements[sortedSettlements.length - 1]?.week_end?.split('T')[0];

    return {
      start: first ?? start,
      end: last ?? end,
    };
  }, [sortedSettlements]);

  const activeRange = mode === 'fleet' ? bookkeepingRange : settlementsRange;

  const [groupBy, setGroupBy] = useState<GroupByWithAllTime>('monthly');
  const [startDate, setStartDate] = useState<string>(activeRange.start);
  const [endDate, setEndDate] = useState<string>(activeRange.end);

  useEffect(() => {
    if (groupBy !== 'all_time') return;
    setStartDate(activeRange.start);
    setEndDate(activeRange.end);
  }, [groupBy, activeRange.end, activeRange.start]);

  useEffect(() => {
    setStartDate(activeRange.start);
    setEndDate(activeRange.end);
  }, [activeRange.end, activeRange.start, mode]);

  const [adjustmentsByDriver, setAdjustmentsByDriver] = useState<Record<string, DriverAdjustment[]>>({});

  useEffect(() => {
    if (mode !== 'drivers') return;
    let cancelled = false;

    async function fetchAdjustments() {
      try {
        const params = new URLSearchParams();
        params.set('from_date', startDate);
        params.set('to_date', endDate);
        if (selectedDriverId !== 'all') params.set('driver_id', selectedDriverId);
        const res = await fetch(`/api/adjustments?${params.toString()}`);
        const json = await res.json();
        if (!res.ok || cancelled) return;
        const adjustments: DriverAdjustment[] = Array.isArray(json.data) ? json.data : [];
        const grouped: Record<string, DriverAdjustment[]> = {};
        for (const adj of adjustments) {
          if (!grouped[adj.driver_id]) grouped[adj.driver_id] = [];
          grouped[adj.driver_id].push(adj);
        }
        if (!cancelled) setAdjustmentsByDriver(grouped);
      } catch {
        if (!cancelled) setAdjustmentsByDriver({});
      }
    }

    fetchAdjustments();
    return () => { cancelled = true; };
  }, [mode, startDate, endDate, selectedDriverId]);

  const filteredEntries = useMemo(() => {
    if (groupBy === 'all_time') return sortedEntries;
    const start = parseISO(startDate);
    const end = parseISO(endDate);

    return sortedEntries.filter((e) => {
      const s = parseISO(e.start_date);
      const ed = parseISO(e.end_date);
      return ed >= start && s <= end;
    });
  }, [groupBy, sortedEntries, startDate, endDate]);

  const filteredSettlements = useMemo(() => {
    const base = selectedDriverId === 'all' ? sortedSettlements : sortedSettlements.filter((s) => s.driver_id === selectedDriverId);
    if (groupBy === 'all_time') return base;

    const start = parseISO(startDate);
    const end = parseISO(endDate);

    return base.filter((s) => {
      const sStart = parseISO(s.week_start);
      const sEnd = parseISO(s.week_end);
      return sEnd >= start && sStart <= end;
    });
  }, [endDate, groupBy, selectedDriverId, sortedSettlements, startDate]);

  const allFleetPeriodOptions = useMemo(() => {
    if (groupBy === 'all_time') return [{ key: 'all_time', label: 'All time', start: bookkeepingRange.start, end: bookkeepingRange.end }];
    const map = new Map<string, { key: string; label: string; start: string; end: string }>();
    for (const e of sortedEntries) {
      const weekStart = parseISO(e.start_date.split('T')[0]);
      let key: string, label: string, start: string, end: string;
      if (groupBy === 'weekly') {
        key = e.id;
        start = e.start_date.split('T')[0];
        end = e.end_date.split('T')[0];
        label = `${formatShortDate(start)} – ${formatShortDate(end)}`;
      } else if (groupBy === 'monthly') {
        // A period can span two months; offer both as selectable options.
        for (const slice of splitAcrossMonths(e.start_date.split('T')[0], e.end_date.split('T')[0])) {
          const mStart = parseISO(slice.month);
          const monthKey = `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, '0')}`;
          if (!map.has(monthKey)) {
            map.set(monthKey, {
              key: monthKey,
              label: mStart.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
              start: safeIso(startOfMonth(mStart)),
              end: safeIso(endOfMonth(mStart)),
            });
          }
        }
        continue;
      } else if (groupBy === 'quarterly') {
        const q = getQuarter(weekStart);
        key = `${weekStart.getFullYear()}-Q${q}`;
        label = `${weekStart.getFullYear()} Q${q}`;
        start = safeIso(new Date(weekStart.getFullYear(), (q - 1) * 3, 1));
        end = safeIso(new Date(weekStart.getFullYear(), q * 3, 0));
      } else {
        key = String(weekStart.getFullYear());
        label = key;
        start = safeIso(new Date(weekStart.getFullYear(), 0, 1));
        end = safeIso(new Date(weekStart.getFullYear(), 11, 31));
      }
      if (!map.has(key)) map.set(key, { key, label, start, end });
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime());
    return arr;
  }, [bookkeepingRange.end, bookkeepingRange.start, groupBy, sortedEntries]);

  const allDriverPeriodOptions = useMemo(() => {
    if (groupBy === 'all_time') return [{ key: 'all_time', label: 'All time', start: settlementsRange.start, end: settlementsRange.end }];
    const base = selectedDriverId === 'all' ? sortedSettlements : sortedSettlements.filter((s) => s.driver_id === selectedDriverId);
    const map = new Map<string, { key: string; label: string; start: string; end: string }>();
    for (const s of base) {
      const weekStart = parseISO(s.week_start.split('T')[0]);
      let key: string, label: string, start: string, end: string;
      if (groupBy === 'weekly') {
        start = s.week_start.split('T')[0];
        end = s.week_end.split('T')[0];
        key = `${start}_${end}`;
        label = `${formatShortDate(start)} – ${formatShortDate(end)}`;
      } else if (groupBy === 'monthly') {
        const mStart = startOfMonth(weekStart);
        const mEnd = endOfMonth(weekStart);
        key = `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, '0')}`;
        label = mStart.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
        start = safeIso(mStart);
        end = safeIso(mEnd);
      } else if (groupBy === 'quarterly') {
        const q = getQuarter(weekStart);
        key = `${weekStart.getFullYear()}-Q${q}`;
        label = `${weekStart.getFullYear()} Q${q}`;
        start = safeIso(new Date(weekStart.getFullYear(), (q - 1) * 3, 1));
        end = safeIso(new Date(weekStart.getFullYear(), q * 3, 0));
      } else {
        key = String(weekStart.getFullYear());
        label = key;
        start = safeIso(new Date(weekStart.getFullYear(), 0, 1));
        end = safeIso(new Date(weekStart.getFullYear(), 11, 31));
      }
      if (!map.has(key)) map.set(key, { key, label, start, end });
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime());
    return arr;
  }, [groupBy, selectedDriverId, settlementsRange.end, settlementsRange.start, sortedSettlements]);

  const aggregated = useMemo<AggregatedPeriod[]>(() => {
    const map = new Map<string, AggregatedPeriod>();

    /** Fold one period's figures (optionally weighted) into a bucket. */
    const addToBucket = (
      bucket: { key: string; label: string; start: string; end: string },
      income: CategoryTotals,
      expenses: CategoryTotals,
      totalIncome: number,
      totalExpenses: number,
    ) => {
      const existing = map.get(bucket.key);
      if (!existing) {
        map.set(bucket.key, {
          ...bucket,
          income,
          expenses,
          total_income: totalIncome,
          total_expenses: totalExpenses,
          net_profit: totalIncome - totalExpenses,
        });
        return;
      }
      map.set(bucket.key, {
        ...existing,
        start: parseISO(bucket.start).getTime() < parseISO(existing.start).getTime() ? bucket.start : existing.start,
        end: parseISO(bucket.end).getTime() > parseISO(existing.end).getTime() ? bucket.end : existing.end,
        income: mergeTotals(existing.income, income),
        expenses: mergeTotals(existing.expenses, expenses),
        total_income: existing.total_income + totalIncome,
        total_expenses: existing.total_expenses + totalExpenses,
        net_profit: existing.net_profit + (totalIncome - totalExpenses),
      });
    };

    for (const e of filteredEntries) {
      const periodStart = e.start_date.split('T')[0];
      const periodEnd = e.end_date.split('T')[0];
      const weekStart = parseISO(periodStart);

      // Split the entries into income and expense sides by their category.
      let income = initTotals();
      let expenses = initTotals();
      for (const entry of e.entries || []) {
        const category = categoryById.get(entry.category_id);
        const amount = Number(entry.amount) || 0;
        if (!category || amount === 0) continue;
        if (category.kind === 'income') income = addTo(income, entry.category_id, amount);
        else expenses = addTo(expenses, entry.category_id, amount);
      }

      const totalIncome = Number(e.total_income) || 0;
      const totalExpenses = Number(e.total_expenses) || 0;

      if (groupBy === 'monthly') {
        // A period that straddles a month boundary is split by day count, so
        // each month gets its actual share. Bucketing the whole period by its
        // start date — as this did before — put every day of a 29 Jun–5 Jul
        // week into June, which quietly overstated one month's accounts and
        // understated the next.
        for (const slice of splitAcrossMonths(periodStart, periodEnd)) {
          const mStart = parseISO(slice.month);
          addToBucket(
            {
              key: `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, '0')}`,
              label: mStart.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
              start: safeIso(startOfMonth(mStart)),
              end: safeIso(endOfMonth(mStart)),
            },
            scaleTotals(income, slice.weight),
            scaleTotals(expenses, slice.weight),
            totalIncome * slice.weight,
            totalExpenses * slice.weight,
          );
        }
        continue;
      }

      let key: string;
      let label: string;
      let start: string;
      let end: string;

      if (groupBy === 'all_time') {
        key = 'all_time';
        start = bookkeepingRange.start;
        end = bookkeepingRange.end;
        label = 'All time';
      } else if (groupBy === 'weekly') {
        key = e.id;
        start = periodStart;
        end = periodEnd;
        label = `${formatShortDate(start)} – ${formatShortDate(end)}`;
      } else if (groupBy === 'quarterly') {
        const q = getQuarter(weekStart);
        key = `${weekStart.getFullYear()}-Q${q}`;
        label = `${weekStart.getFullYear()} Q${q}`;
        start = safeIso(new Date(weekStart.getFullYear(), (q - 1) * 3, 1));
        end = safeIso(new Date(weekStart.getFullYear(), q * 3, 0));
      } else {
        key = String(weekStart.getFullYear());
        label = key;
        start = safeIso(new Date(weekStart.getFullYear(), 0, 1));
        end = safeIso(new Date(weekStart.getFullYear(), 11, 31));
      }

      addToBucket({ key, label, start, end }, income, expenses, totalIncome, totalExpenses);
    }

    const arr = Array.from(map.values());
    arr.sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime());

    return arr.map((p) => ({
      ...p,
      total_income: Math.round(p.total_income * 100) / 100,
      total_expenses: Math.round(p.total_expenses * 100) / 100,
      net_profit: Math.round(p.net_profit * 100) / 100,
    }));
  }, [bookkeepingRange.end, bookkeepingRange.start, filteredEntries, groupBy]);

  const driverAggregated = useMemo<DriverAggregatedPeriod[]>(() => {
    const map = new Map<string, DriverAggregatedPeriod>();

    for (const s of filteredSettlements) {
      const weekStart = parseISO(s.week_start.split('T')[0]);

      let key: string;
      let label: string;
      let start: string;
      let end: string;

      if (groupBy === 'all_time') {
        key = 'all_time';
        start = settlementsRange.start;
        end = settlementsRange.end;
        label = 'All time';
      } else if (groupBy === 'weekly') {
        start = s.week_start.split('T')[0];
        end = s.week_end.split('T')[0];
        key = `${start}_${end}`;
        label = `${formatShortDate(start)} – ${formatShortDate(end)}`;
      } else if (groupBy === 'monthly') {
        const mStart = startOfMonth(weekStart);
        const mEnd = endOfMonth(weekStart);
        key = `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, '0')}`;
        label = mStart.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
        start = safeIso(mStart);
        end = safeIso(mEnd);
      } else if (groupBy === 'quarterly') {
        const q = getQuarter(weekStart);
        key = `${weekStart.getFullYear()}-Q${q}`;
        label = `${weekStart.getFullYear()} Q${q}`;
        const qStart = new Date(weekStart.getFullYear(), (q - 1) * 3, 1);
        const qEnd = new Date(weekStart.getFullYear(), q * 3, 0);
        start = safeIso(qStart);
        end = safeIso(qEnd);
      } else {
        key = String(weekStart.getFullYear());
        label = key;
        const yStart = new Date(weekStart.getFullYear(), 0, 1);
        const yEnd = new Date(weekStart.getFullYear(), 11, 31);
        start = safeIso(yStart);
        end = safeIso(yEnd);
      }

      let income = initTotals();
      const platforms = s.settlement_platforms || [];
      if (platforms.length > 0) {
        for (const p of platforms) {
          income = addTo(income, platformToCategory(p.platform_id), p.gross_fare);
        }
      } else {
        // No platform rows — book the whole gross to the "Other" catch-all.
        income = addTo(income, platformToCategory(null), s.total_gross_fare || 0);
      }

      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          label,
          start,
          end,
          income,
          total_gross: s.total_gross_fare || 0,
          total_net: s.total_net || 0,
          total_payout: s.final_balance || 0,
          total_fss_tax: s.fss_tax || 0,
          settlement_count: 1,
        });
        continue;
      }

      map.set(key, {
        ...existing,
        start: parseISO(start).getTime() < parseISO(existing.start).getTime() ? start : existing.start,
        end: parseISO(end).getTime() > parseISO(existing.end).getTime() ? end : existing.end,
        income: mergeTotals(existing.income, income),
        total_gross: existing.total_gross + (s.total_gross_fare || 0),
        total_net: existing.total_net + (s.total_net || 0),
        total_payout: existing.total_payout + (s.final_balance || 0),
        total_fss_tax: existing.total_fss_tax + (s.fss_tax || 0),
        settlement_count: existing.settlement_count + 1,
      });
    }

    const arr = Array.from(map.values());
    arr.sort((a, b) => parseISO(a.start).getTime() - parseISO(b.start).getTime());

    return arr.map((p) => ({
      ...p,
      total_gross: Math.round(p.total_gross * 100) / 100,
      total_net: Math.round(p.total_net * 100) / 100,
      total_payout: Math.round(p.total_payout * 100) / 100,
      total_fss_tax: Math.round(p.total_fss_tax * 100) / 100,
    }));
  }, [filteredSettlements, groupBy, settlementsRange.end, settlementsRange.start]);

  const totals = useMemo(() => {
    const totalIncome = aggregated.reduce((acc, p) => acc + p.total_income, 0);
    const totalExpenses = aggregated.reduce((acc, p) => acc + p.total_expenses, 0);
    const netProfit = aggregated.reduce((acc, p) => acc + p.net_profit, 0);

    const income = aggregated.reduce((acc, p) => mergeTotals(acc, p.income), initTotals());
    const expenses = aggregated.reduce((acc, p) => mergeTotals(acc, p.expenses), initTotals());

    const profitMargin = totalIncome > 0 ? netProfit / totalIncome : 0;

    const best = aggregated.reduce<AggregatedPeriod | null>((prev, cur) => {
      if (!prev) return cur;
      return cur.net_profit > prev.net_profit ? cur : prev;
    }, null);

    const worst = aggregated.reduce<AggregatedPeriod | null>((prev, cur) => {
      if (!prev) return cur;
      return cur.net_profit < prev.net_profit ? cur : prev;
    }, null);

    return {
      totalIncome,
      totalExpenses,
      netProfit,
      profitMargin,
      income,
      expenses,
      best,
      worst,
    };
  }, [aggregated]);

  const driverTotals = useMemo(() => {
    const totalGross = driverAggregated.reduce((acc, p) => acc + p.total_gross, 0);
    const totalNet = driverAggregated.reduce((acc, p) => acc + p.total_net, 0);
    const totalPayout = driverAggregated.reduce((acc, p) => acc + p.total_payout, 0);
    const totalTax = driverAggregated.reduce((acc, p) => acc + p.total_fss_tax, 0);
    const income = driverAggregated.reduce((acc, p) => mergeTotals(acc, p.income), initTotals());
    const settlementCount = driverAggregated.reduce((acc, p) => acc + p.settlement_count, 0);

    const payoutMargin = totalGross > 0 ? totalPayout / totalGross : 0;

    const best = driverAggregated.reduce<DriverAggregatedPeriod | null>((prev, cur) => {
      if (!prev) return cur;
      return cur.total_payout > prev.total_payout ? cur : prev;
    }, null);

    const worst = driverAggregated.reduce<DriverAggregatedPeriod | null>((prev, cur) => {
      if (!prev) return cur;
      return cur.total_payout < prev.total_payout ? cur : prev;
    }, null);

    return {
      totalGross,
      totalNet,
      totalPayout,
      totalTax,
      income,
      settlementCount,
      payoutMargin,
      best,
      worst,
    };
  }, [driverAggregated]);

  const unpaidTotals = useMemo(() => {
    const unpaid = filteredSettlements.filter((s) => !s.paid_at);
    const unpaidCount = unpaid.length;
    const unpaidPayout = unpaid.reduce((acc, s) => acc + (s.final_balance || 0), 0);
    const unpaidGross = unpaid.reduce((acc, s) => acc + (s.total_gross_fare || 0), 0);

    let unpaidIncome = initTotals();
    for (const s of unpaid) {
      const platforms = s.settlement_platforms || [];
      if (platforms.length > 0) {
        for (const p of platforms) {
          unpaidIncome = addTo(unpaidIncome, platformToCategory(p.platform_id), p.gross_fare);
        }
      } else {
        unpaidIncome = { ...unpaidIncome, other_earnings: unpaidIncome.other_earnings + (s.total_gross_fare || 0) };
      }
    }

    const paidCount = filteredSettlements.length - unpaidCount;
    const paidPayout = filteredSettlements.reduce((acc, s) => acc + (s.final_balance || 0), 0) - unpaidPayout;

    const totalAdjustmentsNet = Object.values(adjustmentsByDriver).reduce(
      (acc, adjs) => acc + calculateAdjustmentsNet(adjs), 0
    );

    const totalPayable = Math.round((unpaidPayout + totalAdjustmentsNet) * 100) / 100;

    return {
      unpaidCount,
      unpaidPayout: Math.round(unpaidPayout * 100) / 100,
      unpaidGross: Math.round(unpaidGross * 100) / 100,
      unpaidIncome,
      paidCount,
      paidPayout: Math.round(paidPayout * 100) / 100,
      totalAdjustmentsNet: Math.round(totalAdjustmentsNet * 100) / 100,
      totalPayable,
    };
  }, [adjustmentsByDriver, filteredSettlements]);

  const perDriverUnpaid = useMemo(() => {
    const unpaid = filteredSettlements.filter((s) => !s.paid_at);
    const map = new Map<string, { driver_id: string; driver_name: string; unpaidPayout: number; unpaidCount: number; adjustmentsNet: number; totalPayable: number }>();

    for (const s of unpaid) {
      const name = s.drivers?.full_name || drivers.find((d) => d.id === s.driver_id)?.full_name || 'Unknown Driver';
      const existing = map.get(s.driver_id);
      map.set(s.driver_id, {
        driver_id: s.driver_id,
        driver_name: name,
        unpaidPayout: (existing?.unpaidPayout || 0) + (s.final_balance || 0),
        unpaidCount: (existing?.unpaidCount || 0) + 1,
        adjustmentsNet: 0,
        totalPayable: 0,
      });
    }

    for (const [driverId, adjs] of Object.entries(adjustmentsByDriver)) {
      const net = calculateAdjustmentsNet(adjs);
      const existing = map.get(driverId);
      if (existing) {
        existing.adjustmentsNet = net;
      } else {
        const name = drivers.find((d) => d.id === driverId)?.full_name || 'Unknown Driver';
        map.set(driverId, {
          driver_id: driverId,
          driver_name: name,
          unpaidPayout: 0,
          unpaidCount: 0,
          adjustmentsNet: net,
          totalPayable: 0,
        });
      }
    }

    const rows = Array.from(map.values()).map((r) => ({
      ...r,
      unpaidPayout: Math.round(r.unpaidPayout * 100) / 100,
      adjustmentsNet: Math.round(r.adjustmentsNet * 100) / 100,
      totalPayable: Math.round((r.unpaidPayout + r.adjustmentsNet) * 100) / 100,
    }));
    rows.sort((a, b) => b.totalPayable - a.totalPayable);
    return rows;
  }, [adjustmentsByDriver, drivers, filteredSettlements]);

  const driverRankings = useMemo(() => {
    if (selectedDriverId !== 'all') return [] as Array<{ driver_id: string; driver_name: string; payout: number; net: number; gross: number; settlements: number; adjustmentsNet: number }>;
    const map = new Map<string, { driver_id: string; driver_name: string; payout: number; net: number; gross: number; settlements: number; adjustmentsNet: number }>();

    for (const s of filteredSettlements) {
      const name = s.drivers?.full_name || drivers.find((d) => d.id === s.driver_id)?.full_name || 'Unknown Driver';
      const existing = map.get(s.driver_id);
      const next = {
        driver_id: s.driver_id,
        driver_name: name,
        payout: (existing?.payout || 0) + (s.final_balance || 0),
        net: (existing?.net || 0) + (s.total_net || 0),
        gross: (existing?.gross || 0) + (s.total_gross_fare || 0),
        settlements: (existing?.settlements || 0) + 1,
        adjustmentsNet: 0,
      };
      map.set(s.driver_id, next);
    }

    for (const [driverId, adjs] of Object.entries(adjustmentsByDriver)) {
      const net = calculateAdjustmentsNet(adjs);
      const existing = map.get(driverId);
      if (existing) {
        existing.adjustmentsNet = Math.round(net * 100) / 100;
      }
    }

    const rows = Array.from(map.values());
    rows.sort((a, b) => b.gross - a.gross);
    return rows;
  }, [adjustmentsByDriver, drivers, filteredSettlements, selectedDriverId]);

  const deltas = useMemo(() => {
    if (aggregated.length < 2) {
      return {
        incomeDelta: 0,
        expenseDelta: 0,
        profitDelta: 0,
        marginDelta: 0,
      };
    }

    const last = aggregated[aggregated.length - 1];
    const prev = aggregated[aggregated.length - 2];

    const incomeDelta = prev.total_income === 0 ? 0 : (last.total_income - prev.total_income) / prev.total_income;
    const expenseDelta = prev.total_expenses === 0 ? 0 : (last.total_expenses - prev.total_expenses) / prev.total_expenses;
    const profitDelta = prev.net_profit === 0 ? 0 : (last.net_profit - prev.net_profit) / Math.abs(prev.net_profit);

    const lastMargin = last.total_income > 0 ? last.net_profit / last.total_income : 0;
    const prevMargin = prev.total_income > 0 ? prev.net_profit / prev.total_income : 0;
    const marginDelta = prevMargin === 0 ? 0 : (lastMargin - prevMargin) / Math.abs(prevMargin);

    return { incomeDelta, expenseDelta, profitDelta, marginDelta };
  }, [aggregated]);

  const driverDeltas = useMemo(() => {
    if (driverAggregated.length < 2) {
      return {
        grossDelta: 0,
        payoutDelta: 0,
        marginDelta: 0,
      };
    }

    const last = driverAggregated[driverAggregated.length - 1];
    const prev = driverAggregated[driverAggregated.length - 2];

    const grossDelta = prev.total_gross === 0 ? 0 : (last.total_gross - prev.total_gross) / prev.total_gross;
    const payoutDelta = prev.total_payout === 0 ? 0 : (last.total_payout - prev.total_payout) / Math.abs(prev.total_payout);

    const lastMargin = last.total_gross > 0 ? last.total_payout / last.total_gross : 0;
    const prevMargin = prev.total_gross > 0 ? prev.total_payout / prev.total_gross : 0;
    const marginDelta = prevMargin === 0 ? 0 : (lastMargin - prevMargin) / Math.abs(prevMargin);

    return { grossDelta, payoutDelta, marginDelta };
  }, [driverAggregated]);

  /**
   * Chart series are one key per category, so the stacked bars widen with the
   * fleet's own chart of accounts. The category id is the dataKey; the label
   * and colour come from the category itself.
   */
  const incomeSeries = useMemo(
    () => incomeCategories.map((c) => ({ id: c.id, name: c.name, color: c.color })),
    [incomeCategories],
  );
  const expenseSeries = useMemo(
    () => expenseCategories.map((c) => ({ id: c.id, name: c.name, color: c.color })),
    [expenseCategories],
  );

  const chartData = useMemo(() => {
    return aggregated.map((p) => {
      const row: Record<string, string | number> = {
        label: p.label,
        total_income: p.total_income,
        total_expenses: p.total_expenses,
        net_profit: p.net_profit,
        profit_margin: p.total_income > 0 ? p.net_profit / p.total_income : 0,
      };
      for (const s of incomeSeries) row[s.id] = p.income[s.id] || 0;
      for (const s of expenseSeries) row[s.id] = p.expenses[s.id] || 0;
      return row;
    });
  }, [aggregated, incomeSeries, expenseSeries]);

  const driverChartData = useMemo(() => {
    return driverAggregated.map((p) => {
      const row: Record<string, string | number> = {
        label: p.label,
        total_gross: p.total_gross,
        total_net: p.total_net,
        total_payout: p.total_payout,
        payout_margin: p.total_gross > 0 ? p.total_payout / p.total_gross : 0,
      };
      for (const s of incomeSeries) row[s.id] = p.income[s.id] || 0;
      return row;
    });
  }, [driverAggregated, incomeSeries]);

  /** Pie rows built from whatever categories carry a figure. */
  const buildPie = (totalsByCategory: CategoryTotals, series: { id: string; name: string; color: string }[]) =>
    series
      .map((s) => ({ name: s.name, value: totalsByCategory[s.id] || 0, color: s.color }))
      .filter((r) => r.value > 0);

  /**
   * The two biggest earning platforms, for the pair of driver-mode KPI tiles.
   * These used to be hardcoded to Uber and Bolt, which showed a fleet working
   * with neither two permanently empty cards.
   */
  const topDriverPlatforms = useMemo(
    () =>
      [...incomeSeries]
        .sort((a, b) => (driverTotals.income[b.id] || 0) - (driverTotals.income[a.id] || 0))
        .slice(0, 2),
    [incomeSeries, driverTotals.income],
  );

  const incomePie = useMemo(
    () => buildPie(totals.income, incomeSeries),
    [totals.income, incomeSeries],
  );

  const driverIncomePie = useMemo(
    () => buildPie(driverTotals.income, incomeSeries),
    [driverTotals.income, incomeSeries],
  );

  const expensePie = useMemo(
    () => buildPie(totals.expenses, expenseSeries),
    [totals.expenses, expenseSeries],
  );

  // Fallback only — pie slices now carry their category's own colour.
  const palette = {
    income: ['#14784a', '#0ea5e9', '#8b5cf6', '#64748b'],
    expenses: ['#f59e0b', '#ef4444', '#0ea5e9', '#8b5cf6', '#10b981', '#64748b', '#f97316', '#a1a1b5'],
  };

  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  useEffect(() => {
    const base = mode === 'fleet' ? aggregated : driverAggregated;
    if (base.length === 0) {
      setSelectedKey(null);
      return;
    }

    if (!selectedKey || !base.some((p) => p.key === selectedKey)) {
      setSelectedKey(base[base.length - 1].key);
    }
  }, [aggregated, driverAggregated, mode, selectedKey]);

  const selectedPeriod = useMemo(() => {
    if (mode !== 'fleet') return null;
    if (!selectedKey) return aggregated[aggregated.length - 1] ?? null;
    return aggregated.find((p) => p.key === selectedKey) ?? aggregated[aggregated.length - 1] ?? null;
  }, [mode, selectedKey, aggregated]);

  const selectedDriverPeriod = useMemo(() => {
    if (mode !== 'drivers') return null;
    if (!selectedKey) return driverAggregated[driverAggregated.length - 1] ?? null;
    return driverAggregated.find((p) => p.key === selectedKey) ?? driverAggregated[driverAggregated.length - 1] ?? null;
  }, [driverAggregated, mode, selectedKey]);

  const journalLines = useMemo(() => {
    if (!selectedPeriod) return [] as Array<{ account: string; debit: number; credit: number }>; 

    const lines: Array<{ account: string; debit: number; credit: number }> = [];

    const incomeTotal = selectedPeriod.total_income;
    const expenseTotal = selectedPeriod.total_expenses;

    if (incomeTotal > 0) {
      lines.push({ account: 'Bank / Cash (Income received)', debit: incomeTotal, credit: 0 });
      for (const s of incomeSeries) {
        const value = selectedPeriod.income[s.id] || 0;
        if (value) lines.push({ account: `Revenue: ${s.name}`, debit: 0, credit: value });
      }
    }

    if (expenseTotal > 0) {
      for (const s of expenseSeries) {
        const value = selectedPeriod.expenses[s.id] || 0;
        if (value) lines.push({ account: `Expense: ${s.name}`, debit: value, credit: 0 });
      }
      lines.push({ account: 'Bank / Cash (Expenses paid)', debit: 0, credit: expenseTotal });
    }

    const debitTotal = lines.reduce((acc, l) => acc + l.debit, 0);
    const creditTotal = lines.reduce((acc, l) => acc + l.credit, 0);

    const diff = Math.round((debitTotal - creditTotal) * 100) / 100;
    if (Math.abs(diff) >= 0.01) {
      if (diff > 0) {
        lines.push({ account: 'Suspense (balancing)', debit: 0, credit: diff });
      } else {
        lines.push({ account: 'Suspense (balancing)', debit: -diff, credit: 0 });
      }
    }

    return lines.map((l) => ({
      ...l,
      debit: Math.round(l.debit * 100) / 100,
      credit: Math.round(l.credit * 100) / 100,
    }));
  }, [selectedPeriod, incomeSeries, expenseSeries]);

  const exportSummaryCsv = () => {
    if (mode === 'fleet') {
      // One column per category the fleet keeps, named after the category.
      const rows = aggregated.map((p) => {
        const row: Record<string, string | number> = {
          period: p.label,
          start: p.start,
          end: p.end,
          total_income: Math.round(p.total_income * 100) / 100,
          total_expenses: Math.round(p.total_expenses * 100) / 100,
          net_profit: Math.round(p.net_profit * 100) / 100,
        };
        for (const s of incomeSeries) {
          row[`income_${s.name}`] = Math.round((p.income[s.id] || 0) * 100) / 100;
        }
        for (const s of expenseSeries) {
          row[`expense_${s.name}`] = Math.round((p.expenses[s.id] || 0) * 100) / 100;
        }
        return row;
      });

      downloadTextFile(`financials_fleet_${startDate}_to_${endDate}_${groupBy}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
      return;
    }

    const rows = driverAggregated.map((p) => {
      const row: Record<string, string | number> = {
        period: p.label,
        start: p.start,
        end: p.end,
        scope: selectedDriverId === 'all' ? 'all_drivers' : selectedDriverId,
        total_gross: Math.round(p.total_gross * 100) / 100,
        total_net: Math.round(p.total_net * 100) / 100,
        total_payout: Math.round(p.total_payout * 100) / 100,
        total_fss_tax: Math.round(p.total_fss_tax * 100) / 100,
        settlement_count: p.settlement_count,
      };
      for (const s of incomeSeries) {
        row[`${s.name}_gross`] = Math.round((p.income[s.id] || 0) * 100) / 100;
      }
      return row;
    });

    downloadTextFile(`financials_drivers_${startDate}_to_${endDate}_${groupBy}_${selectedDriverId}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
  };

  const exportJournalCsv = () => {
    if (!selectedPeriod) return;

    const rows = journalLines.map((l) => ({
      period: selectedPeriod.label,
      start: selectedPeriod.start,
      end: selectedPeriod.end,
      account: l.account,
      debit: l.debit,
      credit: l.credit,
    }));

    downloadTextFile(`journal_${selectedPeriod.start}_to_${selectedPeriod.end}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
  };

  // QuickBooks / Xero-ready transaction export over the whole filtered range —
  // one signed line per bookkeeping category, ready to import as a bank CSV.
  const exportAccountingCsv = (flavor: 'quickbooks' | 'xero') => {
    const txns = buildBookkeepingTxns(filteredEntries, categories);
    if (txns.length === 0) return;
    const csv = flavor === 'xero' ? toXeroCsv(txns) : toQuickBooksCsv(txns);
    downloadTextFile(`accounting_${flavor}_${startDate}_to_${endDate}.csv`, csv, 'text/csv;charset=utf-8');
  };

  const exportDriverRankingsCsv = () => {
    if (mode !== 'drivers' || selectedDriverId !== 'all') return;
    const rows = driverRankings.map((r) => ({
      driver_name: r.driver_name,
      driver_id: r.driver_id,
      gross: Math.round(r.gross * 100) / 100,
      net: Math.round(r.net * 100) / 100,
      payout: Math.round(r.payout * 100) / 100,
      settlements: r.settlements,
    }));
    downloadTextFile(`driver_rankings_${startDate}_to_${endDate}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
  };

  const deltaLabel = (ratio: number) => {
    const pct = clamp(ratio * 100, -999, 999);
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  };

  return (
    <div className={styles.dashboard}>
      <div className={styles.headerRow}>
        <div className={styles.filtersCard}>
          <div className={styles.filtersTop}>
            <div className={styles.titleBlock}>
              <div className={styles.title}>{mode === 'fleet' ? 'Financial Performance' : 'Driver Performance'}</div>
              <div className={styles.subtitle}>
                {mode === 'fleet'
                  ? 'Advanced breakdown from Weekly Bookkeeping entries'
                  : 'Compare drivers by gross, net and payout from Driver Settlements'}
                {(startDate !== activeRange.start || endDate !== activeRange.end) && groupBy !== 'all_time' ? (
                  <button
                    type="button"
                    className={styles.resetLink}
                    onClick={() => {
                      setStartDate(activeRange.start);
                      setEndDate(activeRange.end);
                    }}
                  >
                    Reset to all dates
                  </button>
                ) : null}
              </div>
            </div>

            <div className={styles.modeToggle}>
              <button
                className={`${styles.toggleBtn} ${mode === 'fleet' ? styles.toggleBtnActive : ''}`}
                onClick={() => setMode('fleet')}
                type="button"
              >
                Fleet
              </button>
              <button
                className={`${styles.toggleBtn} ${mode === 'drivers' ? styles.toggleBtnActive : ''}`}
                onClick={() => setMode('drivers')}
                type="button"
              >
                Drivers
              </button>
            </div>

            <div className={styles.actions}>
              <button
                className={styles.actionBtn}
                onClick={exportSummaryCsv}
                disabled={mode === 'fleet' ? aggregated.length === 0 : driverAggregated.length === 0}
              >
                Export Summary CSV
              </button>
              {mode === 'fleet' ? (
                <>
                  <button className={styles.actionBtnSecondary} onClick={exportJournalCsv} disabled={!selectedPeriod}>
                    Export Journal CSV
                  </button>
                  <button
                    className={styles.actionBtnSecondary}
                    onClick={() => exportAccountingCsv('quickbooks')}
                    disabled={filteredEntries.length === 0}
                    title="Bank-format CSV ready to import into QuickBooks Online"
                  >
                    QuickBooks CSV
                  </button>
                  <button
                    className={styles.actionBtnSecondary}
                    onClick={() => exportAccountingCsv('xero')}
                    disabled={filteredEntries.length === 0}
                    title="Bank statement CSV ready to import into Xero"
                  >
                    Xero CSV
                  </button>
                </>
              ) : (
                <button
                  className={styles.actionBtnSecondary}
                  onClick={exportDriverRankingsCsv}
                  disabled={selectedDriverId !== 'all' || driverRankings.length === 0}
                >
                  Export Rankings CSV
                </button>
              )}
            </div>
          </div>

          <div className={styles.filtersGrid}>
            {mode === 'drivers' ? (
              <div className={styles.filterGroup}>
                <div className={styles.filterLabel}>Driver</div>
                <select
                  className={styles.select}
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                >
                  <option value="all">All drivers</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.full_name}
                      {d.status !== 'active' ? ' (inactive)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className={styles.filterGroup}>
              <div className={styles.filterLabel}>From</div>
              <DatePicker
                value={startDate}
                onChange={setStartDate}
                maxDate={endDate}
                disabled={groupBy === 'all_time'}
              />
            </div>
            <div className={styles.filterGroup}>
              <div className={styles.filterLabel}>To</div>
              <DatePicker
                value={endDate}
                onChange={setEndDate}
                minDate={startDate}
                maxDate={safeIso(new Date())}
                disabled={groupBy === 'all_time'}
              />
            </div>
            <div className={styles.filterGroup}>
              <div className={styles.filterLabel}>Group By</div>
              <select
                className={styles.select}
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupByWithAllTime)}
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
                <option value="all_time">All time</option>
              </select>
            </div>
            {mode === 'fleet' ? (
              <div className={styles.filterGroup}>
                <div className={styles.filterLabel}>Active Period</div>
                <select
                  className={styles.select}
                  value={selectedKey ?? ''}
                  onChange={(e) => {
                    const nextKey = e.target.value;
                    setSelectedKey(nextKey);
                    const period = allFleetPeriodOptions.find((p) => p.key === nextKey);
                    if (period) {
                      setStartDate(period.start);
                      setEndDate(period.end);
                    }
                  }}
                  disabled={allFleetPeriodOptions.length === 0}
                >
                  {allFleetPeriodOptions.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className={styles.filterGroup}>
                <div className={styles.filterLabel}>Active Period</div>
                <select
                  className={styles.select}
                  value={selectedKey ?? ''}
                  onChange={(e) => {
                    const nextKey = e.target.value;
                    setSelectedKey(nextKey);
                    const period = allDriverPeriodOptions.find((p) => p.key === nextKey);
                    if (period) {
                      setStartDate(period.start);
                      setEndDate(period.end);
                    }
                  }}
                  disabled={allDriverPeriodOptions.length === 0}
                >
                  {allDriverPeriodOptions.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {mode === 'fleet' && aggregated.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>No bookkeeping data in this range</div>
          <div className={styles.emptyHint}>Adjust the date range or add entries in Bookkeeping.</div>
        </div>
      ) : null}

      {mode === 'drivers' && driverAggregated.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyTitle}>No driver settlements in this range</div>
          <div className={styles.emptyHint}>Adjust the date range or create settlements first.</div>
        </div>
      ) : null}

      {mode === 'fleet' && aggregated.length > 0 ? (
        <>
          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Total Income</div>
              <div className={styles.kpiValue}>{formatCurrencyEUR(totals.totalIncome)}</div>
              <div className={styles.kpiMeta}>Last period: {deltaLabel(deltas.incomeDelta)}</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Total Expenses</div>
              <div className={styles.kpiValue}>{formatCurrencyEUR(totals.totalExpenses)}</div>
              <div className={styles.kpiMeta}>Last period: {deltaLabel(deltas.expenseDelta)}</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Net Profit</div>
              <div className={`${styles.kpiValue} ${totals.netProfit >= 0 ? styles.positive : styles.negative}`}>
                {formatCurrencyEUR(totals.netProfit)}
              </div>
              <div className={styles.kpiMeta}>Last period: {deltaLabel(deltas.profitDelta)}</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Profit Margin</div>
              <div className={styles.kpiValue}>{(totals.profitMargin * 100).toFixed(1)}%</div>
              <div className={styles.kpiMeta}>Last period: {deltaLabel(deltas.marginDelta)}</div>
            </div>
          </div>

          <div className={styles.grid2}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>Income vs Expenses vs Profit</div>
                <div className={styles.panelSubtitle}>Trend across {groupBy} periods</div>
              </div>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={chartData} margin={{ top: 10, right: 18, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 12,
                        boxShadow: 'var(--shadow-md)',
                      }}
                      formatter={(value: unknown) => formatCurrencyEUR(Number(value))}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="total_income" name="Income" stroke="var(--pos)" strokeWidth={2.4} dot={false} />
                    <Line type="monotone" dataKey="total_expenses" name="Expenses" stroke="var(--neg)" strokeWidth={2.4} dot={false} />
                    <Line type="monotone" dataKey="net_profit" name="Profit" stroke="var(--accent)" strokeWidth={2.4} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>Profit Margin</div>
                <div className={styles.panelSubtitle}>How efficiently income converts into profit</div>
              </div>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={chartData} margin={{ top: 10, right: 18, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis
                      tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                      tickFormatter={(v) => `${Math.round(v * 100)}%`}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 12,
                        boxShadow: 'var(--shadow-md)',
                      }}
                      formatter={(value: unknown) => `${(Number(value) * 100).toFixed(1)}%`}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="profit_margin" name="Margin" stroke="var(--color-info)" strokeWidth={2.4} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className={styles.grid2}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>Income Breakdown (Stacked)</div>
                <div className={styles.panelSubtitle}>Uber / Bolt / eCabs / Other</div>
              </div>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={chartData} margin={{ top: 10, right: 18, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 12,
                        boxShadow: 'var(--shadow-md)',
                      }}
                      formatter={(value: unknown) => formatCurrencyEUR(Number(value))}
                    />
                    <Legend />
                    {incomeSeries.map((s, i) => (
                      <Bar key={s.id} dataKey={s.id} name={s.name} stackId="income" fill={s.color || palette.income[i % palette.income.length]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>Expense Breakdown (Stacked)</div>
                <div className={styles.panelSubtitle}>Major cost drivers over time</div>
              </div>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={chartData} margin={{ top: 10, right: 18, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 12,
                        boxShadow: 'var(--shadow-md)',
                      }}
                      formatter={(value: unknown) => formatCurrencyEUR(Number(value))}
                    />
                    <Legend />
                    {expenseSeries.map((s, i) => (
                      <Bar key={s.id} dataKey={s.id} name={s.name} stackId="exp" fill={s.color || palette.expenses[i % palette.expenses.length]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className={styles.grid3}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>Income Mix</div>
                <div className={styles.panelSubtitle}>Contribution by platform</div>
              </div>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 12,
                        boxShadow: 'var(--shadow-md)',
                      }}
                      formatter={(value: unknown) => formatCurrencyEUR(Number(value))}
                    />
                    <Legend />
                    <Pie data={incomePie} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} paddingAngle={2}>
                      {incomePie.map((row, idx) => (
                        <Cell key={idx} fill={row.color || palette.income[idx % palette.income.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>Expense Mix</div>
                <div className={styles.panelSubtitle}>Where the money is going</div>
              </div>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 12,
                        boxShadow: 'var(--shadow-md)',
                      }}
                      formatter={(value: unknown) => formatCurrencyEUR(Number(value))}
                    />
                    <Legend />
                    <Pie data={expensePie} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} paddingAngle={2}>
                      {expensePie.map((row, idx) => (
                        <Cell key={idx} fill={row.color || palette.expenses[idx % palette.expenses.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>Highlights</div>
                <div className={styles.panelSubtitle}>Best / worst profitability</div>
              </div>

              <div className={styles.highlights}>
                <div className={styles.highlightCard}>
                  <div className={styles.highlightLabel}>Best Period</div>
                  <div className={styles.highlightValue}>{totals.best ? formatCurrencyEUR(totals.best.net_profit) : '—'}</div>
                  <div className={styles.highlightMeta}>{totals.best ? totals.best.label : ''}</div>
                </div>
                <div className={styles.highlightCard}>
                  <div className={styles.highlightLabel}>Worst Period</div>
                  <div className={`${styles.highlightValue} ${styles.negative}`}>{totals.worst ? formatCurrencyEUR(totals.worst.net_profit) : '—'}</div>
                  <div className={styles.highlightMeta}>{totals.worst ? totals.worst.label : ''}</div>
                </div>
              </div>

              <div className={styles.summaryBox}>
                <div className={styles.summaryRow}>
                  <span>Selected period</span>
                  <span className={styles.mono}>{selectedPeriod ? selectedPeriod.label : '—'}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Income</span>
                  <span className={styles.mono}>{selectedPeriod ? formatCurrencyEUR(selectedPeriod.total_income) : '—'}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Expenses</span>
                  <span className={styles.mono}>{selectedPeriod ? formatCurrencyEUR(selectedPeriod.total_expenses) : '—'}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Profit</span>
                  <span className={`${styles.mono} ${selectedPeriod && selectedPeriod.net_profit < 0 ? styles.negative : styles.positive}`}>
                    {selectedPeriod ? formatCurrencyEUR(selectedPeriod.net_profit) : '—'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeaderRow}>
              <div>
                <div className={styles.panelTitle}>Journal Preview</div>
                <div className={styles.panelSubtitle}>Suggested bookkeeping entries for the active period</div>
              </div>
            </div>

            <div className={styles.journalGrid}>
              <div className={styles.journalMeta}>
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Period</span>
                  <span className={styles.metaValue}>{selectedPeriod?.label ?? '—'}</span>
                </div>
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Date range</span>
                  <span className={styles.metaValue}>
                    {selectedPeriod ? `${selectedPeriod.start} → ${selectedPeriod.end}` : '—'}
                  </span>
                </div>
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Income</span>
                  <span className={styles.metaValue}>{selectedPeriod ? formatCurrencyEUR(selectedPeriod.total_income) : '—'}</span>
                </div>
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Expenses</span>
                  <span className={styles.metaValue}>{selectedPeriod ? formatCurrencyEUR(selectedPeriod.total_expenses) : '—'}</span>
                </div>
                <div className={styles.metaRow}>
                  <span className={styles.metaLabel}>Net</span>
                  <span className={styles.metaValue}>
                    {selectedPeriod ? formatCurrencyEUR(selectedPeriod.net_profit) : '—'}
                  </span>
                </div>
              </div>

              <div className={styles.journalTableWrap}>
                <table className={styles.journalTable}>
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th className={styles.right}>Debit</th>
                      <th className={styles.right}>Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journalLines.map((l) => (
                      <tr key={l.account}>
                        <td>{l.account}</td>
                        <td className={styles.right}>{l.debit ? formatCurrencyEUR(l.debit) : ''}</td>
                        <td className={styles.right}>{l.credit ? formatCurrencyEUR(l.credit) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {mode === 'drivers' && driverAggregated.length > 0 ? (
        <>
          {/* Primary KPIs */}
          <div className={styles.kpiGrid6}>
            <div className={`${styles.kpiCard} ${styles.kpiCardAlert}`}>
              <div className={styles.kpiLabel}>
                <span className={styles.kpiLabelWithTip}>
                  Unpaid Settlements
                  <span className={styles.tipIcon}>?</span>
                  <span className={styles.tipText}>This is excluding adjustments</span>
                </span>
              </div>
              <div className={`${styles.kpiValue} ${unpaidTotals.unpaidPayout > 0 ? styles.negative : ''}`}>
                {formatCurrencyEUR(unpaidTotals.unpaidPayout)}
              </div>
              <div className={styles.kpiMeta}>{unpaidTotals.unpaidCount} settlement{unpaidTotals.unpaidCount !== 1 ? 's' : ''} pending</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Adjustments</div>
              <div className={`${styles.kpiValue} ${unpaidTotals.totalAdjustmentsNet >= 0 ? styles.positive : styles.negative}`}>
                {unpaidTotals.totalAdjustmentsNet >= 0 ? '+' : ''}{formatCurrencyEUR(unpaidTotals.totalAdjustmentsNet)}
              </div>
              <div className={styles.kpiMeta}>Bonuses, deductions, expenses</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Total Gross</div>
              <div className={styles.kpiValue}>{formatCurrencyEUR(driverTotals.totalGross)}</div>
              <div className={styles.kpiMeta}>{driverTotals.settlementCount} settlement{driverTotals.settlementCount !== 1 ? 's' : ''}</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Driver Cut (Payout)</div>
              <div className={`${styles.kpiValue} ${driverTotals.totalPayout >= 0 ? styles.positive : styles.negative}`}>
                {formatCurrencyEUR(driverTotals.totalPayout)}
              </div>
              <div className={styles.kpiMeta}>{(driverTotals.payoutMargin * 100).toFixed(1)}% of gross</div>
            </div>
            {topDriverPlatforms.map((s) => (
              <div key={s.id} className={styles.kpiCard}>
                <div className={styles.kpiLabel}>{s.name} Earnings</div>
                <div className={styles.kpiValue}>{formatCurrencyEUR(driverTotals.income[s.id] || 0)}</div>
                <div className={styles.kpiMeta}>
                  {driverTotals.totalGross > 0
                    ? `${(((driverTotals.income[s.id] || 0) / driverTotals.totalGross) * 100).toFixed(1)}% of gross`
                    : '—'}
                </div>
              </div>
            ))}
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>FSS / Tax</div>
              <div className={styles.kpiValue}>{formatCurrencyEUR(driverTotals.totalTax)}</div>
              <div className={styles.kpiMeta}>Last period: {deltaLabel(driverDeltas.marginDelta)}</div>
            </div>
          </div>

          {/* Financial Summary panels */}
          <div className={styles.grid3}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>Unpaid Breakdown</div>
                <div className={styles.panelSubtitle}>Settlements not yet paid out</div>
              </div>
              <div className={styles.summaryBox}>
                <div className={styles.summaryRow}>
                  <span>Unpaid Payout Total</span>
                  <span className={`${styles.mono} ${unpaidTotals.unpaidPayout > 0 ? styles.negative : ''}`}>
                    {formatCurrencyEUR(unpaidTotals.unpaidPayout)}
                  </span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Unpaid Gross</span>
                  <span className={styles.mono}>{formatCurrencyEUR(unpaidTotals.unpaidGross)}</span>
                </div>
                {incomeSeries
                  .filter((s) => (unpaidTotals.unpaidIncome[s.id] || 0) > 0)
                  .map((s) => (
                    <div key={s.id} className={styles.summaryRow}>
                      <span>Unpaid from {s.name}</span>
                      <span className={styles.mono}>{formatCurrencyEUR(unpaidTotals.unpaidIncome[s.id] || 0)}</span>
                    </div>
                  ))}
                <div className={styles.summaryRow}>
                  <span>Paid so far</span>
                  <span className={`${styles.mono} ${styles.positive}`}>{formatCurrencyEUR(unpaidTotals.paidPayout)}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Paid settlements</span>
                  <span className={styles.mono}>{unpaidTotals.paidCount}</span>
                </div>
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>Platform Breakdown</div>
                <div className={styles.panelSubtitle}>Gross earnings by platform</div>
              </div>
              <div className={styles.summaryBox}>
                {incomeSeries
                  .filter((s) => (driverTotals.income[s.id] || 0) > 0)
                  .map((s) => (
                    <div key={s.id} className={styles.summaryRow}>
                      <span>{s.name}</span>
                      <span className={styles.mono}>{formatCurrencyEUR(driverTotals.income[s.id] || 0)}</span>
                    </div>
                  ))}
              </div>
              <div className={`${styles.summaryBox} ${styles.summaryBoxSecondary}`}>
                <div className={styles.summaryRow}>
                  <span>Total Gross</span>
                  <span className={styles.mono}>{formatCurrencyEUR(driverTotals.totalGross)}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Total Net</span>
                  <span className={styles.mono}>{formatCurrencyEUR(driverTotals.totalNet)}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Driver Cut (Payout)</span>
                  <span className={`${styles.mono} ${styles.positive}`}>{formatCurrencyEUR(driverTotals.totalPayout)}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>FSS/Tax</span>
                  <span className={styles.mono}>{formatCurrencyEUR(driverTotals.totalTax)}</span>
                </div>
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>{selectedDriverId === 'all' ? 'Top Drivers' : 'Driver Summary'}</div>
                <div className={styles.panelSubtitle}>{selectedDriverId === 'all' ? 'Ranked by total gross' : 'Selected period details'}</div>
              </div>

              {selectedDriverId === 'all' ? (
                <div className={styles.summaryBox}>
                  {driverRankings.slice(0, 10).map((r) => (
                    <div key={r.driver_id} className={styles.summaryRow}>
                      <span>{r.driver_name}</span>
                      <span className={styles.mono}>{formatCurrencyEUR(r.gross)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className={styles.highlights}>
                    <div className={styles.highlightCard}>
                      <div className={styles.highlightLabel}>Best Period</div>
                      <div className={styles.highlightValue}>
                        {driverTotals.best ? formatCurrencyEUR(driverTotals.best.total_payout) : '—'}
                      </div>
                      <div className={styles.highlightMeta}>{driverTotals.best ? driverTotals.best.label : ''}</div>
                    </div>
                    <div className={styles.highlightCard}>
                      <div className={styles.highlightLabel}>Worst Period</div>
                      <div className={`${styles.highlightValue} ${styles.negative}`}>
                        {driverTotals.worst ? formatCurrencyEUR(driverTotals.worst.total_payout) : '—'}
                      </div>
                      <div className={styles.highlightMeta}>{driverTotals.worst ? driverTotals.worst.label : ''}</div>
                    </div>
                  </div>
                  <div className={styles.summaryBox}>
                    <div className={styles.summaryRow}>
                      <span>Selected period</span>
                      <span className={styles.mono}>{selectedDriverPeriod ? selectedDriverPeriod.label : '—'}</span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span>Gross</span>
                      <span className={styles.mono}>{selectedDriverPeriod ? formatCurrencyEUR(selectedDriverPeriod.total_gross) : '—'}</span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span>Payout</span>
                      <span className={`${styles.mono} ${selectedDriverPeriod && selectedDriverPeriod.total_payout < 0 ? styles.negative : styles.positive}`}>
                        {selectedDriverPeriod ? formatCurrencyEUR(selectedDriverPeriod.total_payout) : '—'}
                      </span>
                    </div>
                    <div className={styles.summaryRow}>
                      <span>FSS/Tax</span>
                      <span className={styles.mono}>{selectedDriverPeriod ? formatCurrencyEUR(selectedDriverPeriod.total_fss_tax) : '—'}</span>
                    </div>
                    {perDriverUnpaid.length > 0 ? (
                      <>
                        <div className={styles.summaryRow} style={{ borderTop: '1px solid var(--border-color)', paddingTop: 8, marginTop: 4 }}>
                          <span>Unpaid Settlements</span>
                          <span className={`${styles.mono} ${styles.negative}`}>{formatCurrencyEUR(perDriverUnpaid[0]?.unpaidPayout || 0)}</span>
                        </div>
                        <div className={styles.summaryRow}>
                          <span>Adjustments</span>
                          <span className={`${styles.mono} ${(perDriverUnpaid[0]?.adjustmentsNet || 0) >= 0 ? styles.positive : styles.negative}`}>
                            {(perDriverUnpaid[0]?.adjustmentsNet || 0) >= 0 ? '+' : ''}{formatCurrencyEUR(perDriverUnpaid[0]?.adjustmentsNet || 0)}
                          </span>
                        </div>
                      </>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Per-driver payable breakdown */}
          {perDriverUnpaid.length > 0 && selectedDriverId === 'all' ? (
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>Per-Driver Overview</div>
                <div className={styles.panelSubtitle}>Unpaid settlements &amp; adjustments per driver</div>
              </div>
              <div className={styles.journalTableWrap}>
                <table className={styles.journalTable}>
                  <thead>
                    <tr>
                      <th>Driver</th>
                      <th className={styles.right}>Unpaid Settlements</th>
                      <th className={styles.right}>Adjustments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perDriverUnpaid.map((r) => (
                      <tr key={r.driver_id}>
                        <td>{r.driver_name}</td>
                        <td className={`${styles.right} ${styles.mono}`}>{formatCurrencyEUR(r.unpaidPayout)}</td>
                        <td className={`${styles.right} ${styles.mono} ${r.adjustmentsNet >= 0 ? styles.positive : styles.negative}`}>
                          {r.adjustmentsNet >= 0 ? '+' : ''}{formatCurrencyEUR(r.adjustmentsNet)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border-color)' }}>
                      <td>Total</td>
                      <td className={`${styles.right} ${styles.mono}`}>{formatCurrencyEUR(unpaidTotals.unpaidPayout)}</td>
                      <td className={`${styles.right} ${styles.mono} ${unpaidTotals.totalAdjustmentsNet >= 0 ? styles.positive : styles.negative}`}>
                        {unpaidTotals.totalAdjustmentsNet >= 0 ? '+' : ''}{formatCurrencyEUR(unpaidTotals.totalAdjustmentsNet)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : null}

          {/* Charts (secondary) */}
          <div className={styles.grid2}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>Gross vs Net vs Payout</div>
                <div className={styles.panelSubtitle}>Trend across {groupBy} periods</div>
              </div>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={driverChartData} margin={{ top: 10, right: 18, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 12,
                        boxShadow: 'var(--shadow-md)',
                      }}
                      formatter={(value: unknown) => formatCurrencyEUR(Number(value))}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="total_gross" name="Gross" stroke="var(--color-primary)" strokeWidth={2.4} dot={false} />
                    <Line type="monotone" dataKey="total_net" name="Net" stroke="var(--color-info)" strokeWidth={2.4} dot={false} />
                    <Line type="monotone" dataKey="total_payout" name="Payout" stroke="var(--color-success)" strokeWidth={2.4} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>Gross Breakdown (Stacked)</div>
                <div className={styles.panelSubtitle}>Uber / Bolt / eCabs / Other</div>
              </div>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={driverChartData} margin={{ top: 10, right: 18, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 12,
                        boxShadow: 'var(--shadow-md)',
                      }}
                      formatter={(value: unknown) => formatCurrencyEUR(Number(value))}
                    />
                    <Legend />
                    {incomeSeries.map((s, i) => (
                      <Bar key={s.id} dataKey={s.id} name={s.name} stackId="gross" fill={s.color || palette.income[i % palette.income.length]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className={styles.grid2}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>Gross Mix</div>
                <div className={styles.panelSubtitle}>Contribution by platform</div>
              </div>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 12,
                        boxShadow: 'var(--shadow-md)',
                      }}
                      formatter={(value: unknown) => formatCurrencyEUR(Number(value))}
                    />
                    <Legend />
                    <Pie data={driverIncomePie} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2}>
                      {driverIncomePie.map((row, idx) => (
                        <Cell key={idx} fill={row.color || palette.income[idx % palette.income.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>Payout Margin</div>
                <div className={styles.panelSubtitle}>Payout vs gross</div>
              </div>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={driverChartData} margin={{ top: 10, right: 18, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis
                      tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                      tickFormatter={(v) => `${Math.round(v * 100)}%`}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 12,
                        boxShadow: 'var(--shadow-md)',
                      }}
                      formatter={(value: unknown) => `${(Number(value) * 100).toFixed(1)}%`}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="payout_margin" name="Margin" stroke="var(--color-warning)" strokeWidth={2.4} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
