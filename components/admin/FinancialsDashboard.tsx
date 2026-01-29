'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Driver, DriverSettlement, SettlementPlatform, WeeklyBookkeeping } from '@/lib/types/database';
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
  entries: WeeklyBookkeeping[];
  drivers: DriverListItem[];
  settlements: SettlementWithRelations[];
}

type IncomeBreakdown = {
  uber_earnings: number;
  bolt_earnings: number;
  ecabs_earnings: number;
  other_earnings: number;
};

type ExpenseBreakdown = {
  employees: number;
  repairs: number;
  insurance: number;
  investments: number;
  vat: number;
  rent: number;
  employee_tax: number;
  other_expenses: number;
};

interface AggregatedPeriod {
  key: string;
  label: string;
  start: string;
  end: string;
  income: IncomeBreakdown;
  expenses: ExpenseBreakdown;
  total_income: number;
  total_expenses: number;
  net_profit: number;
}

interface DriverAggregatedPeriod {
  key: string;
  label: string;
  start: string;
  end: string;
  income: IncomeBreakdown;
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

function initIncome(): IncomeBreakdown {
  return { uber_earnings: 0, bolt_earnings: 0, ecabs_earnings: 0, other_earnings: 0 };
}

function initExpenses(): ExpenseBreakdown {
  return {
    employees: 0,
    repairs: 0,
    insurance: 0,
    investments: 0,
    vat: 0,
    rent: 0,
    employee_tax: 0,
    other_expenses: 0,
  };
}

function sumIncome(a: IncomeBreakdown, b: IncomeBreakdown): IncomeBreakdown {
  return {
    uber_earnings: a.uber_earnings + b.uber_earnings,
    bolt_earnings: a.bolt_earnings + b.bolt_earnings,
    ecabs_earnings: a.ecabs_earnings + b.ecabs_earnings,
    other_earnings: a.other_earnings + b.other_earnings,
  };
}

function addPlatformIncome(
  current: IncomeBreakdown,
  platformId: string | null | undefined,
  value: number
): IncomeBreakdown {
  if (!value) return current;
  const key = (platformId || '').toLowerCase();
  if (key === 'uber') return { ...current, uber_earnings: current.uber_earnings + value };
  if (key === 'bolt') return { ...current, bolt_earnings: current.bolt_earnings + value };
  if (key === 'ecabs') return { ...current, ecabs_earnings: current.ecabs_earnings + value };
  return { ...current, other_earnings: current.other_earnings + value };
}

function sumExpenses(a: ExpenseBreakdown, b: ExpenseBreakdown): ExpenseBreakdown {
  return {
    employees: a.employees + b.employees,
    repairs: a.repairs + b.repairs,
    insurance: a.insurance + b.insurance,
    investments: a.investments + b.investments,
    vat: a.vat + b.vat,
    rent: a.rent + b.rent,
    employee_tax: a.employee_tax + b.employee_tax,
    other_expenses: a.other_expenses + b.other_expenses,
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

export default function FinancialsDashboard({ entries, drivers, settlements }: FinancialsDashboardProps) {
  const [mode, setMode] = useState<DashboardMode>('fleet');

  const [selectedDriverId, setSelectedDriverId] = useState<string>('all');

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => parseISO(a.week_start).getTime() - parseISO(b.week_start).getTime());
  }, [entries]);

  const sortedSettlements = useMemo(() => {
    return [...settlements].sort((a, b) => parseISO(a.week_start).getTime() - parseISO(b.week_start).getTime());
  }, [settlements]);

  const bookkeepingRange = useMemo(() => {
    const today = new Date();
    const end = safeIso(today);
    const start = safeIso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 365));

    const first = sortedEntries[0]?.week_start?.split('T')[0];
    const last = sortedEntries[sortedEntries.length - 1]?.week_end?.split('T')[0];

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

  const filteredEntries = useMemo(() => {
    if (groupBy === 'all_time') return sortedEntries;
    const start = parseISO(startDate);
    const end = parseISO(endDate);

    return sortedEntries.filter((e) => {
      const s = parseISO(e.week_start);
      const ed = parseISO(e.week_end);
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

  const aggregated = useMemo<AggregatedPeriod[]>(() => {
    const map = new Map<string, AggregatedPeriod>();

    for (const e of filteredEntries) {
      const weekStart = parseISO(e.week_start.split('T')[0]);
      const weekEnd = parseISO(e.week_end.split('T')[0]);

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
        start = e.week_start.split('T')[0];
        end = e.week_end.split('T')[0];
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

      const income: IncomeBreakdown = {
        uber_earnings: e.uber_earnings,
        bolt_earnings: e.bolt_earnings,
        ecabs_earnings: e.ecabs_earnings,
        other_earnings: e.other_earnings,
      };

      const expenses: ExpenseBreakdown = {
        employees: e.employees,
        repairs: e.repairs,
        insurance: e.insurance,
        investments: e.investments,
        vat: e.vat,
        rent: e.rent,
        employee_tax: e.employee_tax,
        other_expenses: e.other_expenses,
      };

      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          label,
          start,
          end,
          income,
          expenses,
          total_income: e.total_income,
          total_expenses: e.total_expenses,
          net_profit: e.net_profit,
        });
        continue;
      }

      map.set(key, {
        ...existing,
        start: parseISO(start).getTime() < parseISO(existing.start).getTime() ? start : existing.start,
        end: parseISO(end).getTime() > parseISO(existing.end).getTime() ? end : existing.end,
        income: sumIncome(existing.income, income),
        expenses: sumExpenses(existing.expenses, expenses),
        total_income: existing.total_income + e.total_income,
        total_expenses: existing.total_expenses + e.total_expenses,
        net_profit: existing.net_profit + e.net_profit,
      });
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
        key = s.id;
        start = s.week_start.split('T')[0];
        end = s.week_end.split('T')[0];
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

      let income = initIncome();
      const platforms = s.settlement_platforms || [];
      if (platforms.length > 0) {
        for (const p of platforms) {
          income = addPlatformIncome(income, p.platform_id, p.gross_fare);
        }
      } else {
        income = { ...income, other_earnings: income.other_earnings + (s.total_gross_fare || 0) };
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
        income: sumIncome(existing.income, income),
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

    const income = aggregated.reduce((acc, p) => sumIncome(acc, p.income), initIncome());
    const expenses = aggregated.reduce((acc, p) => sumExpenses(acc, p.expenses), initExpenses());

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
    const income = driverAggregated.reduce((acc, p) => sumIncome(acc, p.income), initIncome());
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

  const driverRankings = useMemo(() => {
    if (selectedDriverId !== 'all') return [] as Array<{ driver_id: string; driver_name: string; payout: number; net: number; gross: number; settlements: number }>;
    const map = new Map<string, { driver_id: string; driver_name: string; payout: number; net: number; gross: number; settlements: number }>();

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
      };
      map.set(s.driver_id, next);
    }

    const rows = Array.from(map.values());
    rows.sort((a, b) => b.payout - a.payout);
    return rows;
  }, [drivers, filteredSettlements, selectedDriverId]);

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

  const chartData = useMemo(() => {
    return aggregated.map((p) => ({
      label: p.label,
      total_income: p.total_income,
      total_expenses: p.total_expenses,
      net_profit: p.net_profit,
      profit_margin: p.total_income > 0 ? p.net_profit / p.total_income : 0,
      uber_earnings: p.income.uber_earnings,
      bolt_earnings: p.income.bolt_earnings,
      ecabs_earnings: p.income.ecabs_earnings,
      other_earnings: p.income.other_earnings,
      employees: p.expenses.employees,
      repairs: p.expenses.repairs,
      insurance: p.expenses.insurance,
      investments: p.expenses.investments,
      vat: p.expenses.vat,
      rent: p.expenses.rent,
      employee_tax: p.expenses.employee_tax,
      other_expenses: p.expenses.other_expenses,
    }));
  }, [aggregated]);

  const driverChartData = useMemo(() => {
    return driverAggregated.map((p) => ({
      label: p.label,
      total_gross: p.total_gross,
      total_net: p.total_net,
      total_payout: p.total_payout,
      payout_margin: p.total_gross > 0 ? p.total_payout / p.total_gross : 0,
      uber_earnings: p.income.uber_earnings,
      bolt_earnings: p.income.bolt_earnings,
      ecabs_earnings: p.income.ecabs_earnings,
      other_earnings: p.income.other_earnings,
    }));
  }, [driverAggregated]);

  const incomePie = useMemo(() => {
    const rows = [
      { name: 'Uber', value: totals.income.uber_earnings },
      { name: 'Bolt', value: totals.income.bolt_earnings },
      { name: 'eCabs', value: totals.income.ecabs_earnings },
      { name: 'Other', value: totals.income.other_earnings },
    ].filter((r) => r.value > 0);

    return rows;
  }, [totals.income]);

  const driverIncomePie = useMemo(() => {
    const rows = [
      { name: 'Uber', value: driverTotals.income.uber_earnings },
      { name: 'Bolt', value: driverTotals.income.bolt_earnings },
      { name: 'eCabs', value: driverTotals.income.ecabs_earnings },
      { name: 'Other', value: driverTotals.income.other_earnings },
    ].filter((r) => r.value > 0);

    return rows;
  }, [driverTotals.income]);

  const expensePie = useMemo(() => {
    const rows = [
      { name: 'Employees', value: totals.expenses.employees },
      { name: 'Repairs', value: totals.expenses.repairs },
      { name: 'Insurance', value: totals.expenses.insurance },
      { name: 'Investments', value: totals.expenses.investments },
      { name: 'VAT', value: totals.expenses.vat },
      { name: 'Rent', value: totals.expenses.rent },
      { name: 'Employee Tax', value: totals.expenses.employee_tax },
      { name: 'Other', value: totals.expenses.other_expenses },
    ].filter((r) => r.value > 0);

    return rows;
  }, [totals.expenses]);

  const palette = {
    income: ['#2563eb', '#0ea5e9', '#8b5cf6', '#64748b'],
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
      if (selectedPeriod.income.uber_earnings) lines.push({ account: 'Revenue: Uber', debit: 0, credit: selectedPeriod.income.uber_earnings });
      if (selectedPeriod.income.bolt_earnings) lines.push({ account: 'Revenue: Bolt', debit: 0, credit: selectedPeriod.income.bolt_earnings });
      if (selectedPeriod.income.ecabs_earnings) lines.push({ account: 'Revenue: eCabs', debit: 0, credit: selectedPeriod.income.ecabs_earnings });
      if (selectedPeriod.income.other_earnings) lines.push({ account: 'Revenue: Other', debit: 0, credit: selectedPeriod.income.other_earnings });
    }

    if (expenseTotal > 0) {
      if (selectedPeriod.expenses.employees) lines.push({ account: 'Expense: Employees', debit: selectedPeriod.expenses.employees, credit: 0 });
      if (selectedPeriod.expenses.repairs) lines.push({ account: 'Expense: Repairs', debit: selectedPeriod.expenses.repairs, credit: 0 });
      if (selectedPeriod.expenses.insurance) lines.push({ account: 'Expense: Insurance', debit: selectedPeriod.expenses.insurance, credit: 0 });
      if (selectedPeriod.expenses.investments) lines.push({ account: 'Expense: Investments', debit: selectedPeriod.expenses.investments, credit: 0 });
      if (selectedPeriod.expenses.vat) lines.push({ account: 'Expense: VAT', debit: selectedPeriod.expenses.vat, credit: 0 });
      if (selectedPeriod.expenses.rent) lines.push({ account: 'Expense: Rent', debit: selectedPeriod.expenses.rent, credit: 0 });
      if (selectedPeriod.expenses.employee_tax) lines.push({ account: 'Expense: Employee Tax', debit: selectedPeriod.expenses.employee_tax, credit: 0 });
      if (selectedPeriod.expenses.other_expenses) lines.push({ account: 'Expense: Other', debit: selectedPeriod.expenses.other_expenses, credit: 0 });
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
  }, [selectedPeriod]);

  const exportSummaryCsv = () => {
    if (mode === 'fleet') {
      const rows = aggregated.map((p) => ({
        period: p.label,
        start: p.start,
        end: p.end,
        total_income: Math.round(p.total_income * 100) / 100,
        total_expenses: Math.round(p.total_expenses * 100) / 100,
        net_profit: Math.round(p.net_profit * 100) / 100,
        uber_earnings: Math.round(p.income.uber_earnings * 100) / 100,
        bolt_earnings: Math.round(p.income.bolt_earnings * 100) / 100,
        ecabs_earnings: Math.round(p.income.ecabs_earnings * 100) / 100,
        other_earnings: Math.round(p.income.other_earnings * 100) / 100,
        employees: Math.round(p.expenses.employees * 100) / 100,
        repairs: Math.round(p.expenses.repairs * 100) / 100,
        insurance: Math.round(p.expenses.insurance * 100) / 100,
        investments: Math.round(p.expenses.investments * 100) / 100,
        vat: Math.round(p.expenses.vat * 100) / 100,
        rent: Math.round(p.expenses.rent * 100) / 100,
        employee_tax: Math.round(p.expenses.employee_tax * 100) / 100,
        other_expenses: Math.round(p.expenses.other_expenses * 100) / 100,
      }));

      downloadTextFile(`financials_fleet_${startDate}_to_${endDate}_${groupBy}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
      return;
    }

    const rows = driverAggregated.map((p) => ({
      period: p.label,
      start: p.start,
      end: p.end,
      scope: selectedDriverId === 'all' ? 'all_drivers' : selectedDriverId,
      total_gross: Math.round(p.total_gross * 100) / 100,
      total_net: Math.round(p.total_net * 100) / 100,
      total_payout: Math.round(p.total_payout * 100) / 100,
      total_fss_tax: Math.round(p.total_fss_tax * 100) / 100,
      settlement_count: p.settlement_count,
      uber_gross: Math.round(p.income.uber_earnings * 100) / 100,
      bolt_gross: Math.round(p.income.bolt_earnings * 100) / 100,
      ecabs_gross: Math.round(p.income.ecabs_earnings * 100) / 100,
      other_gross: Math.round(p.income.other_earnings * 100) / 100,
    }));

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
                <button className={styles.actionBtnSecondary} onClick={exportJournalCsv} disabled={!selectedPeriod}>
                  Export Journal CSV
                </button>
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
                  value={selectedPeriod?.key ?? ''}
                  onChange={(e) => {
                    const nextKey = e.target.value;
                    setSelectedKey(nextKey);
                    const period = aggregated.find((p) => p.key === nextKey);
                    if (period) {
                      setStartDate(period.start);
                      setEndDate(period.end);
                    }
                  }}
                  disabled={aggregated.length === 0}
                >
                  {aggregated.map((p) => (
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
                  value={selectedDriverPeriod?.key ?? ''}
                  onChange={(e) => {
                    const nextKey = e.target.value;
                    setSelectedKey(nextKey);
                    const period = driverAggregated.find((p) => p.key === nextKey);
                    if (period) {
                      setStartDate(period.start);
                      setEndDate(period.end);
                    }
                  }}
                  disabled={driverAggregated.length === 0}
                >
                  {driverAggregated.map((p) => (
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
                    <Line type="monotone" dataKey="total_income" name="Income" stroke="var(--color-primary)" strokeWidth={2.4} dot={false} />
                    <Line type="monotone" dataKey="total_expenses" name="Expenses" stroke="var(--color-warning)" strokeWidth={2.4} dot={false} />
                    <Line type="monotone" dataKey="net_profit" name="Profit" stroke="var(--color-success)" strokeWidth={2.4} dot={false} />
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
                    <Bar dataKey="uber_earnings" name="Uber" stackId="income" fill={palette.income[0]} />
                    <Bar dataKey="bolt_earnings" name="Bolt" stackId="income" fill={palette.income[1]} />
                    <Bar dataKey="ecabs_earnings" name="eCabs" stackId="income" fill={palette.income[2]} />
                    <Bar dataKey="other_earnings" name="Other" stackId="income" fill={palette.income[3]} />
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
                    <Bar dataKey="employees" name="Employees" stackId="exp" fill={palette.expenses[0]} />
                    <Bar dataKey="repairs" name="Repairs" stackId="exp" fill={palette.expenses[1]} />
                    <Bar dataKey="insurance" name="Insurance" stackId="exp" fill={palette.expenses[2]} />
                    <Bar dataKey="investments" name="Investments" stackId="exp" fill={palette.expenses[3]} />
                    <Bar dataKey="vat" name="VAT" stackId="exp" fill={palette.expenses[4]} />
                    <Bar dataKey="rent" name="Rent" stackId="exp" fill={palette.expenses[5]} />
                    <Bar dataKey="employee_tax" name="Employee Tax" stackId="exp" fill={palette.expenses[6]} />
                    <Bar dataKey="other_expenses" name="Other" stackId="exp" fill={palette.expenses[7]} />
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
                      {incomePie.map((_, idx) => (
                        <Cell key={idx} fill={palette.income[idx % palette.income.length]} />
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
                      {expensePie.map((_, idx) => (
                        <Cell key={idx} fill={palette.expenses[idx % palette.expenses.length]} />
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
          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Gross (Driver Revenue)</div>
              <div className={styles.kpiValue}>{formatCurrencyEUR(driverTotals.totalGross)}</div>
              <div className={styles.kpiMeta}>Last period: {deltaLabel(driverDeltas.grossDelta)}</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Net</div>
              <div className={styles.kpiValue}>{formatCurrencyEUR(driverTotals.totalNet)}</div>
              <div className={styles.kpiMeta}>Settlements: {driverTotals.settlementCount}</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Payout (Final Balance)</div>
              <div className={`${styles.kpiValue} ${driverTotals.totalPayout >= 0 ? styles.positive : styles.negative}`}>
                {formatCurrencyEUR(driverTotals.totalPayout)}
              </div>
              <div className={styles.kpiMeta}>Last period: {deltaLabel(driverDeltas.payoutDelta)}</div>
            </div>
            <div className={styles.kpiCard}>
              <div className={styles.kpiLabel}>Payout Margin</div>
              <div className={styles.kpiValue}>{(driverTotals.payoutMargin * 100).toFixed(1)}%</div>
              <div className={styles.kpiMeta}>Last period: {deltaLabel(driverDeltas.marginDelta)}</div>
            </div>
          </div>

          <div className={styles.grid2}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>Gross vs Net vs Payout</div>
                <div className={styles.panelSubtitle}>Trend across {groupBy} periods</div>
              </div>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={320}>
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
                <div className={styles.panelTitle}>Payout Margin</div>
                <div className={styles.panelSubtitle}>Payout vs gross</div>
              </div>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={320}>
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

          <div className={styles.grid2}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>Gross Breakdown (Stacked)</div>
                <div className={styles.panelSubtitle}>Uber / Bolt / eCabs / Other</div>
              </div>
              <div className={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={340}>
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
                    <Bar dataKey="uber_earnings" name="Uber" stackId="gross" fill={palette.income[0]} />
                    <Bar dataKey="bolt_earnings" name="Bolt" stackId="gross" fill={palette.income[1]} />
                    <Bar dataKey="ecabs_earnings" name="eCabs" stackId="gross" fill={palette.income[2]} />
                    <Bar dataKey="other_earnings" name="Other" stackId="gross" fill={palette.income[3]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>Highlights</div>
                <div className={styles.panelSubtitle}>Best / worst payout</div>
              </div>

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
              </div>
            </div>
          </div>

          <div className={styles.grid3}>
            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>Gross Mix</div>
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
                    <Pie data={driverIncomePie} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110} paddingAngle={2}>
                      {driverIncomePie.map((_, idx) => (
                        <Cell key={idx} fill={palette.income[idx % palette.income.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>Top Drivers</div>
                <div className={styles.panelSubtitle}>Ranked by total payout</div>
              </div>
              <div className={styles.summaryBox}>
                {(selectedDriverId === 'all' ? driverRankings.slice(0, 8) : []).map((r) => (
                  <div key={r.driver_id} className={styles.summaryRow}>
                    <span>{r.driver_name}</span>
                    <span className={styles.mono}>{formatCurrencyEUR(r.payout)}</span>
                  </div>
                ))}
                {selectedDriverId !== 'all' ? (
                  <div className={styles.summaryRow}>
                    <span>Viewing</span>
                    <span className={styles.mono}>{drivers.find((d) => d.id === selectedDriverId)?.full_name ?? 'Selected driver'}</span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>Totals</div>
                <div className={styles.panelSubtitle}>Quick rollup</div>
              </div>

              <div className={styles.summaryBox}>
                <div className={styles.summaryRow}>
                  <span>Gross</span>
                  <span className={styles.mono}>{formatCurrencyEUR(driverTotals.totalGross)}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Net</span>
                  <span className={styles.mono}>{formatCurrencyEUR(driverTotals.totalNet)}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>Payout</span>
                  <span className={styles.mono}>{formatCurrencyEUR(driverTotals.totalPayout)}</span>
                </div>
                <div className={styles.summaryRow}>
                  <span>FSS/Tax</span>
                  <span className={styles.mono}>{formatCurrencyEUR(driverTotals.totalTax)}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
