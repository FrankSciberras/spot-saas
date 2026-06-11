'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import DatePicker from '@/components/shared/DatePicker';
import AddDriverModal from '@/components/fleet/AddDriverModal';
import SettlementImportModal, { type StagedImport, type ImportedFigures } from './SettlementImportModal';
import { getDefaultFssTax, DEFAULT_SCHEME, schemeFromPreset, presetFlatTax, type PlatformConfig } from '@/lib/config/settlements';
import {
  calculateSettlement,
  formatCurrency,
  round2,
  type PlatformEarningsInput
} from '@/lib/utils/settlementCalculations';
import { exportMonthlySettlementsPdf, exportSettlementsPdf } from '@/lib/utils/settlementPdfExport';
import { calculateAdjustmentsNet } from '@/lib/utils/adjustments';
import type { Driver, DriverSettlement, SettlementPlatform, DriverAdjustment, SettlementPreset } from '@/lib/types/database';
import styles from './settlements.module.css';
import bulkStyles from '@/components/admin/ServicesList.module.css';

function dateOnly(value: string): string {
  return value.includes('T') ? value.split('T')[0] : value;
}


interface DriverWithStatus extends Pick<Driver, 'id' | 'full_name' | 'employment_type'> {
  status: string;
  settlement_driver_share_pct?: number | null;
  settlement_preset_id?: string | null;
}

interface SettlementWithRelations extends DriverSettlement {
  drivers: Pick<Driver, 'id' | 'full_name'> & { status: string } | null;
  settlement_platforms: SettlementPlatform[];
  settlement_month: string | null;
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
  /** Fleet-wide default driver share %, the legacy fallback when no preset applies. */
  orgDriverSharePct: number;
  /** The fleet's settlement presets (for resolving the selected driver's scheme). */
  presets: SettlementPreset[];
  /** The fleet's default preset id (applies to drivers without their own). */
  orgDefaultPresetId: string | null;
  /** The fleet's active platforms (entry-form rows). Resolved server-side. */
  platforms: PlatformConfig[];
}

export default function SettlementsWorkspace({
  activeDrivers,
  archivedDrivers,
  settlements,
  isAdmin,
  orgDriverSharePct,
  presets,
  orgDefaultPresetId,
  platforms,
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
  const [isEditingPeriod, setIsEditingPeriod] = useState(false);
  const [editPeriodStart, setEditPeriodStart] = useState('');
  const [editPeriodEnd, setEditPeriodEnd] = useState('');
  const [editPeriodName, setEditPeriodName] = useState('');
  const [editPeriodMonth, setEditPeriodMonth] = useState('');
  const [periodSaving, setPeriodSaving] = useState(false);
  
  // Driver selection state
  const [showArchived, setShowArchived] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDriver, setShowAddDriver] = useState(false);
  
  // Form state
  const [periodName, setPeriodName] = useState('');
  const [fssTax, setFssTax] = useState(getDefaultFssTax().toString());
  // When set, FSS/tax auto-derives as this % of the balance before tax (from a
  // percent-tax preset). Cleared the moment the operator edits the tax field.
  const [taxAutoPct, setTaxAutoPct] = useState<number | null>(null);

  // CSV import: staged figures per driver/platform (nothing saved until the
  // operator creates drafts or saves a prefilled form).
  const [showImport, setShowImport] = useState(false);
  const [stagedImport, setStagedImport] = useState<StagedImport>({});
  const [bulkCreating, setBulkCreating] = useState(false);
  const [notes, setNotes] = useState('');
  const [platformData, setPlatformData] = useState<PlatformFormData[]>(() =>
    platforms.map(p => ({
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

  const [selectedDriverAdjustmentsNet, setSelectedDriverAdjustmentsNet] = useState(0);
  
  // Bulk delete state
  const [selectedSettlementIds, setSelectedSettlementIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);

  const [showBulkPaidConfirm, setShowBulkPaidConfirm] = useState(false);
  const [bulkPaidLoading, setBulkPaidLoading] = useState(false);
  const [bulkPaidError, setBulkPaidError] = useState<string | null>(null);

  // Month names
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const getMonthStart = useCallback((value: string) => {
    const isoValue = dateOnly(value);
    if (!isoValue) return '';
    const [year, month] = isoValue.split('-');
    if (!year || !month) return '';
    return `${year}-${month}-01`;
  }, []);

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

  const monthSettlements = useMemo(() => {
    if (selectedMonth === null) return [];

    return settlements.filter(s => {
      const monthDate = s.settlement_month ? new Date(s.settlement_month) : new Date(s.week_start);
      return monthDate.getFullYear() === selectedYear && monthDate.getMonth() === selectedMonth;
    });
  }, [settlements, selectedMonth, selectedYear]);

  useEffect(() => {
    let cancelled = false;

    async function loadSelectedDriverAdjustments() {
      if (!selectedDriverId || !currentPeriod) {
        setSelectedDriverAdjustmentsNet(0);
        return;
      }

      // Saved settlement → show its FROZEN snapshot (stable, never re-fetched).
      if (existingSettlement) {
        setSelectedDriverAdjustmentsNet(existingSettlement.total_adjustments ?? 0);
        return;
      }

      // New settlement → preview the unattached adjustments in this period that
      // WILL be frozen on save.
      const fromDate = dateOnly(currentPeriod.startISO);
      const toDate = dateOnly(currentPeriod.endISO);

      try {
        const url = `/api/adjustments?driver_id=${encodeURIComponent(selectedDriverId)}&from_date=${encodeURIComponent(fromDate)}&to_date=${encodeURIComponent(toDate)}&unassigned=true`;
        const res = await fetch(url);
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || 'Failed to load adjustments');
        }

        const adjustments: DriverAdjustment[] = Array.isArray(json.data) ? json.data : [];
        const net = calculateAdjustmentsNet(adjustments);

        if (!cancelled) {
          setSelectedDriverAdjustmentsNet(net);
        }
      } catch {
        if (!cancelled) {
          setSelectedDriverAdjustmentsNet(0);
        }
      }
    }

    loadSelectedDriverAdjustments();

    return () => {
      cancelled = true;
    };
  }, [currentPeriod, selectedDriverId, existingSettlement]);

  useEffect(() => {
    if (!isEditingPeriod) return;
    if (!currentPeriod) {
      setIsEditingPeriod(false);
      return;
    }

    setEditPeriodStart(currentPeriod.startISO);
    setEditPeriodEnd(currentPeriod.endISO);
    setEditPeriodName(currentPeriod.periodName || '');
    setEditPeriodMonth(currentPeriod.settlementMonth || getMonthStart(currentPeriod.startISO));
  }, [currentPeriod, getMonthStart, isEditingPeriod]);

  const handleExportMonthPdf = useCallback(async () => {
    if (selectedMonth === null || monthSettlements.length === 0) return;

    const monthLabel = `${monthNames[selectedMonth]} ${selectedYear}`;

    // Frozen adjustments linked to this month's settlements (not a live query).
    let adjustmentsByDriver: Record<string, DriverAdjustment[]> = {};
    const monthSettlementIds = monthSettlements.map((s) => s.id).filter(Boolean);
    if (monthSettlementIds.length > 0) {
      try {
        const res = await fetch(`/api/adjustments?settlement_ids=${encodeURIComponent(monthSettlementIds.join(','))}`);
        const json = await res.json();
        if (res.ok) {
          const adjustments: Array<DriverAdjustment> = Array.isArray(json.data) ? json.data : [];
          adjustments.forEach((adj) => {
            adjustmentsByDriver[adj.driver_id] = adjustmentsByDriver[adj.driver_id] || [];
            adjustmentsByDriver[adj.driver_id].push(adj);
          });
        }
      } catch {
        adjustmentsByDriver = {};
      }
    }

    const exportRows = monthSettlements.map(s => ({
      driverId: s.driver_id,
      driverName: s.drivers?.full_name || 'Unknown Driver',
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
    }));

    exportMonthlySettlementsPdf({
      monthLabel,
      settlements: exportRows,
      driverAdjustmentsByDriver: adjustmentsByDriver,
    });
  }, [monthNames, monthSettlements, selectedMonth, selectedYear]);

  // Export PDF handler
  const handleExportPdf = useCallback(async () => {
    if (!currentPeriod || periodSettlements.length === 0) return;

    // Frozen adjustments linked to this period's settlements (not a live query).
    let adjustmentsByDriver: Record<string, DriverAdjustment[]> = {};
    const periodSettlementIds = periodSettlements.map((s) => s.id).filter(Boolean);
    if (periodSettlementIds.length > 0) {
      try {
        const res = await fetch(`/api/adjustments?settlement_ids=${encodeURIComponent(periodSettlementIds.join(','))}`);
        const json = await res.json();
        if (res.ok) {
          const adjustments: Array<DriverAdjustment> = Array.isArray(json.data) ? json.data : [];
          adjustments.forEach((adj) => {
            adjustmentsByDriver[adj.driver_id] = adjustmentsByDriver[adj.driver_id] || [];
            adjustmentsByDriver[adj.driver_id].push(adj);
          });
        }
      } catch {
        adjustmentsByDriver = {};
      }
    }

    const settlementsData = periodSettlements.map(s => {
      const platforms = s.settlement_platforms || [];
      const driverAdjustments = adjustmentsByDriver[s.driver_id] || [];
      const driverAdjustmentsNet = calculateAdjustmentsNet(driverAdjustments);
      return {
        driverName: s.drivers?.full_name || 'Unknown Driver',
        weekLabel: s.week_label,
        periodName: s.period_name,
        platforms,
        totalGrossFare: s.total_gross_fare,
        totalFiftyPercent: platforms.reduce((sum, p) => sum + p.fifty_percent, 0),
        totalFee: platforms.reduce((sum, p) => sum + p.fee, 0),
        totalNet: s.total_net,
        totalCashRide: platforms.reduce((sum, p) => sum + p.cash_ride, 0),
        totalTips: platforms.reduce((sum, p) => sum + p.tips, 0),
        totalCampaigns: platforms.reduce((sum, p) => sum + p.campaigns, 0),
        totalBalanceBeforeTax: s.total_balance_before_tax,
        fssTax: s.fss_tax,
        finalBalance: s.final_balance,
        driverAdjustments,
        driverAdjustmentsNet,
        status: s.status,
        paidAt: s.paid_at,
        notes: s.notes,
      };
    });

    // Sort by driver name
    settlementsData.sort((a, b) => a.driverName.localeCompare(b.driverName));

    exportSettlementsPdf({
      periodLabel: currentPeriod.label,
      periodName: currentPeriod.periodName,
      settlements: settlementsData,
    });
  }, [currentPeriod, periodSettlements]);

  // Get driver's settlement status
  const getDriverStatus = useCallback((driverId: string) => {
    const settlement = periodSettlements.find(s => s.driver_id === driverId);
    if (!settlement) return 'pending';
    return settlement.status;
  }, [periodSettlements]);

  // The preset that would price a NEW settlement for a driver:
  // the driver's own preset, else the fleet default preset, else none (legacy).
  const presetForDriver = useCallback((driverId: string | null) => {
    const driver = [...activeDrivers, ...archivedDrivers].find(d => d.id === driverId);
    const presetId = driver?.settlement_preset_id ?? orgDefaultPresetId;
    return presetId ? presets.find(p => p.id === presetId) ?? null : null;
  }, [activeDrivers, archivedDrivers, presets, orgDefaultPresetId]);

  // ── CSV import ─────────────────────────────────────────────────────────────

  /** Merge one platform's imported figures into the staged set. */
  const handleImportApply = useCallback((platformId: string, rows: Record<string, ImportedFigures>) => {
    setStagedImport(prev => {
      const next: StagedImport = { ...prev };
      for (const [driverId, figures] of Object.entries(rows)) {
        next[driverId] = { ...(next[driverId] ?? {}), [platformId]: figures };
      }
      return next;
    });
    setShowImport(false);
    const count = Object.keys(rows).length;
    setSuccessMessage(
      `Staged figures for ${count} driver${count === 1 ? '' : 's'}. ` +
      `Select a driver to review, import another platform, or create all drafts.`
    );
  }, []);

  /** Drivers with staged figures but no settlement yet in this period. */
  const stagedPendingIds = useMemo(() => {
    if (!currentPeriod) return [];
    return Object.keys(stagedImport).filter(driverId =>
      !settlements.some(s => s.driver_id === driverId && s.week_start === currentPeriod.startISO)
    );
  }, [stagedImport, settlements, currentPeriod]);

  /** Create a draft settlement for every staged driver (skips existing ones). */
  const handleBulkCreateFromImport = useCallback(async () => {
    if (!currentPeriod || !isAdmin || bulkCreating) return;
    setBulkCreating(true);
    setError(null);
    setSuccessMessage(null);

    let settlementMonth = currentPeriod.settlementMonth;
    if (!settlementMonth && selectedMonth !== null) {
      const month = String(selectedMonth + 1).padStart(2, '0');
      settlementMonth = `${selectedYear}-${month}-01`;
    }

    let created = 0;
    let failed = 0;
    const skipped = Object.keys(stagedImport).length - stagedPendingIds.length;
    const createdIds: string[] = [];

    for (const driverId of stagedPendingIds) {
      const staged = stagedImport[driverId];
      const driver = [...activeDrivers, ...archivedDrivers].find(d => d.id === driverId);

      const platformsPayload = platforms.map(p => {
        const fig = staged[p.id];
        return {
          platform_id: p.id,
          platform_name: p.name,
          gross_fare: fig?.grossFare || 0,
          platform_fee_percent: p.defaultFeePercent,
          cash_ride: fig?.cashRide || 0,
          tips: fig?.tips || 0,
          campaigns: fig?.campaigns || 0,
        };
      });

      // Same tax resolution as the manual form: preset percent → derived from
      // the balance before tax; preset flat → full-time drivers only; no
      // preset → the legacy employment-type default.
      const preset = presetForDriver(driverId);
      const driverScheme = preset
        ? schemeFromPreset(preset)
        : { ...DEFAULT_SCHEME, driverSharePct: driver?.settlement_driver_share_pct ?? orgDriverSharePct };
      const base = calculateSettlement(
        platformsPayload.map(p => ({
          platformId: p.platform_id,
          grossFare: p.gross_fare,
          platformFeePercent: p.platform_fee_percent,
          cashRide: p.cash_ride,
          tips: p.tips,
          campaigns: p.campaigns,
        })),
        0,
        driverScheme,
        0
      );
      let tax: number;
      if (preset && preset.tax_type === 'percent') {
        tax = round2(Math.max(0, base.totalBalanceBeforeTax) * (preset.tax_value / 100));
      } else if (preset) {
        tax = presetFlatTax(preset, driver?.employment_type) ?? 0;
      } else {
        tax = driver?.employment_type === 'full_time' ? getDefaultFssTax() : 0;
      }

      try {
        const res = await fetch('/api/settlements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            driver_id: driverId,
            week_start: currentPeriod.startISO,
            week_end: currentPeriod.endISO,
            week_label: currentPeriod.label,
            period_name: currentPeriod.periodName || null,
            settlement_month: settlementMonth || null,
            fss_tax: tax,
            notes: null,
            status: 'draft',
            platforms: platformsPayload,
          }),
        });
        if (res.ok) {
          created++;
          createdIds.push(driverId);
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    // Created drivers no longer need staged data; keep it for skipped/failed.
    setStagedImport(prev => {
      const next = { ...prev };
      createdIds.forEach(id => delete next[id]);
      return next;
    });

    setBulkCreating(false);
    const parts = [`Created ${created} draft${created === 1 ? '' : 's'} from import`];
    if (skipped > 0) parts.push(`${skipped} already had a settlement (select them to review)`);
    if (failed > 0) parts.push(`${failed} failed`);
    if (failed > 0) setError(parts.join(' · '));
    else setSuccessMessage(parts.join(' · '));
    router.refresh();
  }, [
    currentPeriod, isAdmin, bulkCreating, selectedMonth, selectedYear, stagedImport, stagedPendingIds,
    activeDrivers, archivedDrivers, platforms, presetForDriver, orgDriverSharePct, router,
  ]);

  const startEditingPeriod = useCallback(() => {
    if (!currentPeriod) return;
    setError(null);
    setSuccessMessage(null);
    setIsCreatingPeriod(false);
    setIsEditingPeriod(true);
    setEditPeriodStart(currentPeriod.startISO);
    setEditPeriodEnd(currentPeriod.endISO);
    setEditPeriodName(currentPeriod.periodName || '');
    setEditPeriodMonth(currentPeriod.settlementMonth || getMonthStart(currentPeriod.startISO));
  }, [currentPeriod, getMonthStart]);

  const cancelPeriodEdit = useCallback(() => {
    setIsEditingPeriod(false);
    setError(null);
  }, []);

  const handlePeriodUpdate = useCallback(async () => {
    if (!currentPeriod || !isAdmin) return;

    if (!editPeriodStart || !editPeriodEnd) {
      setError('Start and end dates are required');
      return;
    }

    setPeriodSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/settlements/period', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_week_start: currentPeriod.startISO,
          week_start: editPeriodStart,
          week_end: editPeriodEnd,
          period_name: editPeriodName || null,
          settlement_month: editPeriodMonth || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update period');
      }

      const navigationDate = data.settlement_month || editPeriodMonth || getMonthStart(editPeriodStart);
      if (navigationDate) {
        const [year, month] = String(navigationDate).split('-');
        if (year && month) {
          setSelectedYear(parseInt(year, 10));
          setSelectedMonth(parseInt(month, 10) - 1);
        }
      }

      setSelectedWeekId(data.week_start || editPeriodStart);
      setPeriodName(data.period_name || editPeriodName || '');
      setIsEditingPeriod(false);
      setSuccessMessage('Settlement period updated successfully');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update period');
    } finally {
      setPeriodSaving(false);
    }
  }, [currentPeriod, editPeriodEnd, editPeriodMonth, editPeriodName, editPeriodStart, getMonthStart, isAdmin, router]);

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
      setTaxAutoPct(null); // editing: the stored tax is the source of truth
      setNotes(existing.notes || '');
      // Current platforms first, then any snapshot platforms no longer in the
      // fleet's list (deactivated/deleted) so their saved figures stay visible.
      const rows: PlatformFormData[] = platforms.map(platform => {
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
      });
      for (const p of existing.settlement_platforms || []) {
        if (!rows.some(r => r.platformId === p.platform_id)) {
          rows.push({
            platformId: p.platform_id,
            platformName: p.platform_name,
            grossFare: p.gross_fare?.toString() || '0',
            platformFeePercent: p.platform_fee_percent?.toString() || '0',
            cashRide: p.cash_ride?.toString() || '0',
            tips: p.tips?.toString() || '0',
            campaigns: p.campaigns?.toString() || '0',
          });
        }
      }
      setPlatformData(rows);
    } else {
      // Reset to defaults - keep periodName from current period
      setPeriodName(currentPeriod.periodName || newPeriodName || '');
      const driver = [...activeDrivers, ...archivedDrivers].find(d => d.id === driverId);
      // Tax prefill from the driver's preset (or fleet default preset):
      //   percent tax → auto-derive live from the balance before tax,
      //   flat tax    → flat amount (full-time drivers only, like before).
      // No preset → legacy rule: full_time = €22, everyone else = 0.
      const presetId = driver?.settlement_preset_id ?? orgDefaultPresetId;
      const preset = presetId ? presets.find(p => p.id === presetId) ?? null : null;
      if (preset && preset.tax_type === 'percent') {
        setTaxAutoPct(preset.tax_value);
        setFssTax('0');
      } else if (preset) {
        setTaxAutoPct(null);
        setFssTax(String(presetFlatTax(preset, driver?.employment_type) ?? 0));
      } else {
        setTaxAutoPct(null);
        const defaultFss = driver?.employment_type === 'full_time' ? getDefaultFssTax() : 0;
        setFssTax(defaultFss.toString());
      }
      setNotes('');
      // Prefill from CSV-imported staged figures when we have them.
      const staged = stagedImport[driverId];
      setPlatformData(platforms.map(p => {
        const fig = staged?.[p.id];
        return {
          platformId: p.id,
          platformName: p.name,
          grossFare: fig ? String(fig.grossFare) : '0',
          platformFeePercent: p.defaultFeePercent.toString(),
          cashRide: fig ? String(fig.cashRide) : '0',
          tips: fig ? String(fig.tips) : '0',
          campaigns: fig ? String(fig.campaigns) : '0',
        };
      }));
    }
  }, [currentPeriod, settlements, newPeriodName, activeDrivers, archivedDrivers, presets, orgDefaultPresetId, platforms, stagedImport]);

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

  const currentPreset = useMemo(
    () => presetForDriver(selectedDriverId),
    [presetForDriver, selectedDriverId]
  );

  // Effective scheme for the selected driver/period:
  //   editing an existing settlement → its frozen snapshot,
  //   otherwise → the driver's preset (or fleet default preset),
  //   else → the legacy column-based fallback (driver override / fleet share %).
  const scheme = useMemo(() => {
    if (existingSettlement) {
      return {
        driverSharePct: existingSettlement.driver_share_pct ?? orgDriverSharePct,
        tipsDriverPct: existingSettlement.tips_driver_pct ?? DEFAULT_SCHEME.tipsDriverPct,
        campaignsDriverPct: existingSettlement.campaigns_driver_pct ?? DEFAULT_SCHEME.campaignsDriverPct,
        feeDriverPct: existingSettlement.fee_driver_pct ?? DEFAULT_SCHEME.feeDriverPct,
      };
    }
    if (currentPreset) {
      return schemeFromPreset(currentPreset);
    }
    const driver = [...activeDrivers, ...archivedDrivers].find(d => d.id === selectedDriverId);
    return { ...DEFAULT_SCHEME, driverSharePct: driver?.settlement_driver_share_pct ?? orgDriverSharePct };
  }, [existingSettlement, currentPreset, selectedDriverId, activeDrivers, archivedDrivers, orgDriverSharePct]);

  const currentSharePct = scheme.driverSharePct;

  // Weekly rent: frozen snapshot when editing, else from the preset.
  const rentAmount = existingSettlement
    ? (existingSettlement.rent_amount ?? 0)
    : (currentPreset?.rent_weekly ?? 0);

  // Calculate settlement in real-time. When the preset uses percent tax and the
  // operator hasn't overridden it (taxAutoPct set), the tax derives live from
  // the balance before tax instead of the input field.
  const calculation = useMemo(() => {
    const inputs: PlatformEarningsInput[] = platformData.map(p => ({
      platformId: p.platformId,
      grossFare: parseFloat(p.grossFare) || 0,
      platformFeePercent: parseFloat(p.platformFeePercent) || 0,
      cashRide: parseFloat(p.cashRide) || 0,
      tips: parseFloat(p.tips) || 0,
      campaigns: parseFloat(p.campaigns) || 0,
    }));
    const base = calculateSettlement(inputs, 0, scheme, 0);
    const effTax = taxAutoPct !== null
      ? round2(Math.max(0, base.totalBalanceBeforeTax) * (taxAutoPct / 100))
      : parseFloat(fssTax) || 0;
    return {
      ...base,
      fssTax: round2(effTax),
      rent: round2(rentAmount),
      finalBalance: round2(base.totalBalanceBeforeTax - effTax - rentAmount),
    };
  }, [platformData, fssTax, scheme, taxAutoPct, rentAmount]);

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
        // Effective tax: auto-derived (% presets) or the manual field value.
        fss_tax: calculation.fssTax,
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

  const handleBulkMarkPaid = async () => {
    if (selectedSettlementIds.size === 0 || !isAdmin) return;

    setBulkPaidLoading(true);
    setBulkPaidError(null);

    try {
      const res = await fetch('/api/settlements/bulk', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedSettlementIds), paid_at: new Date().toISOString() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to mark settlements as paid');
      }

      setSelectedSettlementIds(new Set());
      setShowBulkPaidConfirm(false);
      router.refresh();
    } catch (err) {
      setBulkPaidError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setBulkPaidLoading(false);
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

  // Bulk selection handlers
  const toggleSelectSettlement = useCallback((settlementId: string) => {
    setSelectedSettlementIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(settlementId)) {
        newSet.delete(settlementId);
      } else {
        newSet.add(settlementId);
      }
      return newSet;
    });
  }, []);

  const toggleSelectAllInPeriod = useCallback(() => {
    if (selectedSettlementIds.size === periodSettlements.length) {
      setSelectedSettlementIds(new Set());
    } else {
      setSelectedSettlementIds(new Set(periodSettlements.map(s => s.id)));
    }
  }, [periodSettlements, selectedSettlementIds.size]);

  const clearSelection = useCallback(() => {
    setSelectedSettlementIds(new Set());
  }, []);

  // Bulk delete handler
  const handleBulkDelete = async () => {
    if (selectedSettlementIds.size === 0 || !isAdmin) return;

    setBulkDeleteLoading(true);
    setBulkDeleteError(null);

    try {
      const res = await fetch('/api/settlements/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedSettlementIds) }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete settlements');
      }

      setSelectedSettlementIds(new Set());
      setShowBulkDeleteConfirm(false);
      setSelectedDriverId(null);
      router.refresh();
    } catch (err) {
      setBulkDeleteError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setBulkDeleteLoading(false);
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
      {isAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <Link href="/fleet/settlements/settings" className="btn btn-secondary btn-sm">
            ⚙ Settlement rules
          </Link>
        </div>
      )}

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
                <div className={styles.monthActions}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleExportMonthPdf}
                    disabled={monthSettlements.length === 0}
                    title="Export all settlements for this month as a PDF"
                    type="button"
                  >
                    Export Month PDF
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setIsCreatingPeriod(true);
                      setIsEditingPeriod(false);
                      setSelectedWeekId(null);
                      setSelectedDriverId(null);
                      // Pre-fill month - use string construction to avoid timezone issues
                      const month = String(selectedMonth + 1).padStart(2, '0');
                      setNewPeriodMonth(`${selectedYear}-${month}-01`);
                    }}
                    type="button"
                  >
                    + New Week
                  </button>
                </div>
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
                      setIsEditingPeriod(false);
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
                      setIsEditingPeriod(false);
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
          <div className={styles.weekStatsActions}>
            {isAdmin && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowImport(true)}
                title="Import per-driver earnings from a platform CSV export"
              >
                Import CSV
              </button>
            )}
            {isAdmin && periodSettlements.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={startEditingPeriod}
                disabled={periodSaving}
              >
                Edit Week Dates
              </button>
            )}
            {periodSettlements.length > 0 && (
              <button
                type="button"
                className={styles.exportPdfBtn}
                onClick={handleExportPdf}
                title="Export all settlements for this week as PDF"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
                Export PDF
              </button>
            )}
          </div>
        </div>
      )}

      {/* Staged CSV import summary */}
      {currentPeriod && !isCreatingPeriod && Object.keys(stagedImport).length > 0 && (
        <div className={styles.weekStatsBar}>
          <div className={styles.weekStats}>
            <span className={styles.statItem}>
              <span className={styles.statDot} style={{ background: 'var(--accent, #2bbd7e)' }}></span>
              Imported figures staged for {Object.keys(stagedImport).length} driver{Object.keys(stagedImport).length === 1 ? '' : 's'}
              {stagedPendingIds.length < Object.keys(stagedImport).length
                ? ` (${Object.keys(stagedImport).length - stagedPendingIds.length} already have settlements)`
                : ''}
            </span>
          </div>
          <div className={styles.weekStatsActions}>
            {isAdmin && stagedPendingIds.length > 0 && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleBulkCreateFromImport}
                disabled={bulkCreating}
              >
                {bulkCreating ? 'Creating…' : `Create ${stagedPendingIds.length} draft${stagedPendingIds.length === 1 ? '' : 's'}`}
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setStagedImport({})}
              disabled={bulkCreating}
            >
              Clear import
            </button>
          </div>
        </div>
      )}

      {currentPeriod && isEditingPeriod && (
        <div className={styles.newPeriodForm}>
          <div className={styles.formRow}>
            <DatePicker
              value={editPeriodStart}
              onChange={setEditPeriodStart}
              placeholder="Start date"
              disabled={periodSaving}
            />
            <span>to</span>
            <DatePicker
              value={editPeriodEnd}
              onChange={setEditPeriodEnd}
              placeholder="End date"
              minDate={editPeriodStart}
              disabled={periodSaving}
            />
          </div>
          <input
            type="text"
            placeholder="Week name (optional)"
            value={editPeriodName}
            onChange={(e) => setEditPeriodName(e.target.value)}
            className={styles.periodNameInput}
            disabled={periodSaving}
          />
          <input
            type="month"
            value={editPeriodMonth ? editPeriodMonth.slice(0, 7) : ''}
            onChange={(e) => setEditPeriodMonth(e.target.value ? `${e.target.value}-01` : '')}
            className={styles.monthInput}
            disabled={periodSaving}
          />
          <div className={styles.formActions}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handlePeriodUpdate}
              disabled={periodSaving || !editPeriodStart || !editPeriodEnd}
            >
              {periodSaving ? 'Saving...' : 'Save Week Changes'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={cancelPeriodEdit}
              disabled={periodSaving}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Bulk Delete Actions Bar */}
      {selectedSettlementIds.size > 0 && isAdmin && (
        <div className={bulkStyles.bulkActions}>
          <span className={bulkStyles.selectedCount}>
            {selectedSettlementIds.size} settlement{selectedSettlementIds.size !== 1 ? 's' : ''} selected
          </span>
          <div className={bulkStyles.actionButtons}>
            <button
              type="button"
              className={bulkStyles.paidBtn}
              onClick={() => setShowBulkPaidConfirm(true)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Mark Paid Selected
            </button>
            <button
              type="button"
              className={bulkStyles.deleteBtn}
              onClick={() => setShowBulkDeleteConfirm(true)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              Delete Selected
            </button>
          </div>
        </div>
      )}

      {showBulkPaidConfirm && (
        <div className={bulkStyles.modalOverlay} onClick={() => !bulkPaidLoading && setShowBulkPaidConfirm(false)}>
          <div className={bulkStyles.modal} onClick={e => e.stopPropagation()}>
            <h3>Confirm Paid</h3>
            <p>
              Mark <strong>{selectedSettlementIds.size}</strong> settlement{selectedSettlementIds.size !== 1 ? 's' : ''} as paid?
            </p>
            {bulkPaidError && (
              <div className={bulkStyles.error}>{bulkPaidError}</div>
            )}
            <div className={bulkStyles.modalActions}>
              <button
                type="button"
                className={bulkStyles.cancelBtn}
                onClick={() => setShowBulkPaidConfirm(false)}
                disabled={bulkPaidLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className={bulkStyles.paidBtn}
                onClick={handleBulkMarkPaid}
                disabled={bulkPaidLoading}
              >
                {bulkPaidLoading ? 'Marking...' : 'Yes, Mark Paid'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div className={bulkStyles.modalOverlay} onClick={() => !bulkDeleteLoading && setShowBulkDeleteConfirm(false)}>
          <div className={bulkStyles.modal} onClick={e => e.stopPropagation()}>
            <h3>Confirm Deletion</h3>
            <p>
              Are you sure you want to delete <strong>{selectedSettlementIds.size}</strong> settlement{selectedSettlementIds.size !== 1 ? 's' : ''}? 
              This will permanently remove all associated platform data. This action cannot be undone.
            </p>
            {bulkDeleteError && (
              <div className={bulkStyles.error}>{bulkDeleteError}</div>
            )}
            <div className={bulkStyles.modalActions}>
              <button
                type="button"
                className={bulkStyles.cancelBtn}
                onClick={() => setShowBulkDeleteConfirm(false)}
                disabled={bulkDeleteLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className={bulkStyles.confirmDeleteBtn}
                onClick={handleBulkDelete}
                disabled={bulkDeleteLoading}
              >
                {bulkDeleteLoading ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
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
              {isAdmin && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ width: '100%', marginTop: 8 }}
                  onClick={() => setShowAddDriver(true)}
                >
                  + Add driver
                </button>
              )}
            </div>
            
            {/* Select All for bulk delete */}
            {isAdmin && periodSettlements.length > 0 && (
              <div className={styles.selectAllRow}>
                <label className={styles.selectAllLabel}>
                  <input
                    type="checkbox"
                    checked={selectedSettlementIds.size === periodSettlements.length && periodSettlements.length > 0}
                    onChange={toggleSelectAllInPeriod}
                  />
                  <span>Select all ({periodSettlements.length})</span>
                </label>
                {selectedSettlementIds.size > 0 && (
                  <button className={styles.clearSelectionBtn} onClick={clearSelection}>
                    Clear
                  </button>
                )}
              </div>
            )}
            
            <div className={styles.driverList}>
              {displayedDrivers.map(driver => {
                const status = getDriverStatus(driver.id);
                const isSelected = driver.id === selectedDriverId;
                const driverSettlement = periodSettlements.find(s => s.driver_id === driver.id);
                const isPaid = !!driverSettlement?.paid_at;
                const isSettlementSelected = driverSettlement ? selectedSettlementIds.has(driverSettlement.id) : false;
                
                return (
                  <div
                    key={driver.id}
                    className={`${styles.driverItem} ${isSelected ? styles.selected : ''} ${isPaid ? styles.paid : ''} ${isSettlementSelected ? styles.bulkSelected : ''}`}
                  >
                    {isAdmin && driverSettlement && (
                      <input
                        type="checkbox"
                        className={styles.driverCheckbox}
                        checked={isSettlementSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSelectSettlement(driverSettlement.id);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <button
                      className={styles.driverItemBtn}
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
                  </div>
                );
              })}
              {displayedDrivers.length === 0 && (
                <div className={styles.noDrivers}>
                  <p style={{ margin: 0 }}>{searchQuery ? 'No drivers match your search' : 'No drivers found'}</p>
                  {isAdmin && !searchQuery && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      style={{ marginTop: 12 }}
                      onClick={() => setShowAddDriver(true)}
                    >
                      + Add your first driver
                    </button>
                  )}
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
                      <th>Share {currentSharePct}%</th>
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
                      const platformConfig = platforms.find(p => p.id === platform.platformId);
                      
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
                <div className={styles.totalItem}>
                  <span>Adjustments</span>
                  <span className={selectedDriverAdjustmentsNet >= 0 ? styles.balancePositive : styles.balanceNegative}>
                    {formatCurrency(selectedDriverAdjustmentsNet)}
                  </span>
                </div>
                {calculation.rent > 0 && (
                  <div className={styles.totalItem}>
                    <span>Rent</span>
                    <span className={styles.balanceNegative}>-{formatCurrency(calculation.rent)}</span>
                  </div>
                )}
                <div className={styles.fssTaxCompact}>
                  <span>FSS/Tax{taxAutoPct !== null ? ` (auto ${taxAutoPct}%)` : ''}</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={taxAutoPct !== null ? calculation.fssTax : fssTax}
                    onChange={(e) => {
                      setTaxAutoPct(null);
                      setFssTax(e.target.value);
                    }}
                    disabled={!isAdmin}
                  />
                </div>
                <div className={styles.finalBalanceCompact}>
                  <span>Payable Balance</span>
                  <span className={(calculation.finalBalance + selectedDriverAdjustmentsNet) >= 0 ? styles.balancePositive : styles.balanceNegative}>
                    {formatCurrency(calculation.finalBalance + selectedDriverAdjustmentsNet)}
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
              {isAdmin && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ marginTop: 16 }}
                  onClick={() => setShowAddDriver(true)}
                >
                  + Add a driver
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quick-add driver modal */}
      <AddDriverModal
        open={showAddDriver}
        onClose={() => setShowAddDriver(false)}
        onCreated={(driver) => {
          setShowArchived(driver.status !== 'active');
          setSuccessMessage(`Driver "${driver.full_name}" added.`);
          router.refresh();
          // Select the new driver once a period is active so settlement entry can begin.
          if (currentPeriod) {
            setTimeout(() => selectDriver(driver.id), 350);
          }
        }}
      />

      {showImport && (
        <SettlementImportModal
          platforms={platforms}
          drivers={activeDrivers.map(d => ({ id: d.id, full_name: d.full_name }))}
          onApply={handleImportApply}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}
