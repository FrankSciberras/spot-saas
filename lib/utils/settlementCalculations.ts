// =============================================================================
// Settlement Calculations
// =============================================================================
// Centralized calculation logic for driver settlements.
// All formulas are defined here for consistency across the application.

import {
  DEFAULT_COMPONENTS,
  DEFAULT_SCHEME,
  type SettlementComponents,
  type SettlementScheme,
} from '@/lib/config/settlements';

/**
 * Platform earnings input data
 */
export interface PlatformEarningsInput {
  platformId: string;
  grossFare: number;
  platformFeePercent: number;
  cashRide: number;
  tips: number;
  campaigns: number;
}

/**
 * Calculated platform earnings
 */
export interface PlatformEarningsCalculated extends PlatformEarningsInput {
  fiftyPercent: number;
  fee: number;
  net: number;
  balance: number;
}

/**
 * Wage inputs for wage-based pay models. All optional: omitting them (or using
 * DEFAULT_COMPONENTS, where the wage components are off) reproduces the
 * classic revenue-split behaviour exactly.
 */
export interface WageOptions {
  /** Component toggles; disabled components are excluded from the math. */
  components?: SettlementComponents;
  /** Hours worked in the period (used when components.hours is on). */
  hoursWorked?: number;
  /** Hourly wage rate, EUR/h (used when components.hours is on). */
  hourlyRate?: number;
  /** Fixed weekly wage, EUR (used when components.fixed is on). */
  fixedWageWeekly?: number;
}

/**
 * Full settlement calculation result
 */
export interface SettlementCalculation {
  platforms: PlatformEarningsCalculated[];
  totalGrossFare: number;
  totalFiftyPercent: number;
  totalFee: number;
  totalNet: number;
  totalCashRide: number;
  totalTips: number;
  totalCampaigns: number;
  /** Hours worked used for the wage line (0 when wage components are off). */
  hoursWorked: number;
  /** Hourly rate the wage line was priced with. */
  hourlyRate: number;
  /** Wage line: hourly_rate × hours (if on) + fixed weekly wage (if on). */
  wageAmount: number;
  /** Platform balances + wage — the base a percent tax applies to. */
  totalBalanceBeforeTax: number;
  fssTax: number;
  /** Fixed weekly rent deduction (0 when the scheme has no rent). */
  rent: number;
  finalBalance: number;
}

/**
 * Safely parse a number, returning 0 for invalid/empty values
 */
export function safeNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  return isNaN(num) ? 0 : num;
}

/**
 * Round to 2 decimal places
 */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Format currency value
 */
export function formatCurrency(value: number, symbol = '€'): string {
  return `${symbol}${round2(value).toFixed(2)}`;
}

/**
 * Calculate earnings for a single platform under a settlement scheme.
 *
 * Every "to driver" lever defaults (DEFAULT_SCHEME) to the original hardcoded
 * model — 50/50 split, driver keeps all tips & campaigns, driver absorbs the
 * full platform fee — so omitting `scheme` reproduces the legacy numbers.
 *
 * Formulas (pcts as 0–100):
 * - Driver share  = gross_fare * driverSharePct%        (stored as `fiftyPercent`)
 * - Platform fee  = gross_fare * platform_fee_percent%
 * - Fee borne     = Platform fee * feeDriverPct%         (stored as `fee`)
 * - Net           = Driver share - Fee borne
 * - Balance       = Net - Cash Ride
 *                       + Tips * tipsDriverPct%
 *                       + Campaigns * campaignsDriverPct%
 */
export function calculatePlatformEarnings(
  input: PlatformEarningsInput,
  scheme: SettlementScheme = DEFAULT_SCHEME,
  components: SettlementComponents = DEFAULT_COMPONENTS
): PlatformEarningsCalculated {
  const grossFare = safeNumber(input.grossFare);
  const platformFeePercent = safeNumber(input.platformFeePercent);
  const cashRide = safeNumber(input.cashRide);
  const tips = safeNumber(input.tips);
  const campaigns = safeNumber(input.campaigns);

  // A switched-off component contributes nothing, whatever was typed/stored.
  const fiftyPercent = components.share ? round2(grossFare * (scheme.driverSharePct / 100)) : 0;
  const fee = components.fee
    ? round2(grossFare * (platformFeePercent / 100) * (scheme.feeDriverPct / 100))
    : 0;
  const net = round2(fiftyPercent - fee);
  const tipsToDriver = components.tips ? round2(tips * (scheme.tipsDriverPct / 100)) : 0;
  const campaignsToDriver = components.campaigns
    ? round2(campaigns * (scheme.campaignsDriverPct / 100))
    : 0;
  const cashDeducted = components.cash ? cashRide : 0;
  const balance = round2(net - cashDeducted + tipsToDriver + campaignsToDriver);

  return {
    platformId: input.platformId,
    grossFare: round2(grossFare),
    platformFeePercent: round2(platformFeePercent),
    cashRide: round2(cashRide),
    tips: round2(tips),
    campaigns: round2(campaigns),
    fiftyPercent,
    fee,
    net,
    balance,
  };
}

/**
 * Calculate full settlement for all platforms
 *
 * Formulas:
 * - Total Net = sum of net for all platforms
 * - Wage = hourly_rate × hours worked (hours component) + fixed weekly wage (fixed component)
 * - Total Balance Before Tax = sum of platform balances + Wage
 * - Final Balance = Total Balance Before Tax - FSS/Tax - Rent
 *
 * `rent` is the fixed weekly vehicle-rent deduction from the driver's
 * settlement preset (0 = none). `wage` carries the component toggles and wage
 * inputs; omitting it reproduces the classic revenue-split formula exactly.
 * Disabled components (tax, rent, wage lines, and the per-platform lines) are
 * excluded from the math no matter what values are passed.
 */
export function calculateSettlement(
  platformInputs: PlatformEarningsInput[],
  fssTax: number,
  scheme: SettlementScheme = DEFAULT_SCHEME,
  rent: number = 0,
  wage: WageOptions = {}
): SettlementCalculation {
  const components = wage.components ?? DEFAULT_COMPONENTS;
  const platforms = platformInputs.map(p => calculatePlatformEarnings(p, scheme, components));
  const safeFssTax = components.tax ? safeNumber(fssTax) : 0;
  const safeRent = components.rent ? Math.max(0, safeNumber(rent)) : 0;

  const hoursWorked = components.hours ? Math.max(0, safeNumber(wage.hoursWorked)) : 0;
  const hourlyRate = Math.max(0, safeNumber(wage.hourlyRate));
  const hourlyWage = components.hours ? round2(hoursWorked * hourlyRate) : 0;
  const fixedWage = components.fixed ? Math.max(0, safeNumber(wage.fixedWageWeekly)) : 0;
  const wageAmount = round2(hourlyWage + fixedWage);

  const totalGrossFare = round2(platforms.reduce((sum, p) => sum + p.grossFare, 0));
  const totalFiftyPercent = round2(platforms.reduce((sum, p) => sum + p.fiftyPercent, 0));
  const totalFee = round2(platforms.reduce((sum, p) => sum + p.fee, 0));
  const totalNet = round2(platforms.reduce((sum, p) => sum + p.net, 0));
  const totalCashRide = round2(platforms.reduce((sum, p) => sum + p.cashRide, 0));
  const totalTips = round2(platforms.reduce((sum, p) => sum + p.tips, 0));
  const totalCampaigns = round2(platforms.reduce((sum, p) => sum + p.campaigns, 0));
  const totalBalanceBeforeTax = round2(
    platforms.reduce((sum, p) => sum + p.balance, 0) + wageAmount
  );
  const finalBalance = round2(totalBalanceBeforeTax - safeFssTax - safeRent);

  return {
    platforms,
    totalGrossFare,
    totalFiftyPercent,
    totalFee,
    totalNet,
    totalCashRide,
    totalTips,
    totalCampaigns,
    hoursWorked: round2(hoursWorked),
    hourlyRate: round2(hourlyRate),
    wageAmount,
    totalBalanceBeforeTax,
    fssTax: round2(safeFssTax),
    rent: round2(safeRent),
    finalBalance,
  };
}

/**
 * Generate week range string from a date
 * Returns format like "27 Oct – 02 Nov 2024"
 */
export function getWeekRange(date: Date): { start: Date; end: Date; label: string } {
  const dayOfWeek = date.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  
  const start = new Date(date);
  start.setDate(date.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  const formatOptions: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
  const startStr = start.toLocaleDateString('en-GB', formatOptions);
  const endStr = end.toLocaleDateString('en-GB', { ...formatOptions, year: 'numeric' });
  
  const label = `${startStr} – ${endStr}`;

  return { start, end, label };
}

/**
 * Get list of recent weeks for selection
 */
export function getRecentWeeks(count: number = 8): { start: Date; end: Date; label: string }[] {
  const weeks: { start: Date; end: Date; label: string }[] = [];
  const today = new Date();
  
  for (let i = 0; i < count; i++) {
    const weekDate = new Date(today);
    weekDate.setDate(today.getDate() - (i * 7));
    weeks.push(getWeekRange(weekDate));
  }
  
  return weeks;
}

/**
 * Format date as ISO string (YYYY-MM-DD)
 */
export function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0];
}
