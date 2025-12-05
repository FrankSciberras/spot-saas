// =============================================================================
// Settlement Calculations
// =============================================================================
// Centralized calculation logic for driver settlements.
// All formulas are defined here for consistency across the application.

import { DRIVER_SHARE_PERCENT } from '@/lib/config/settlements';

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
  totalBalanceBeforeTax: number;
  fssTax: number;
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
 * Calculate earnings for a single platform
 * 
 * Formulas:
 * - 50% = gross_fare * 0.5
 * - Fee = gross_fare * (platform_fee_percent / 100)
 * - Net = 50% - Fee
 * - Balance = Net - Cash Ride + Tips + Campaigns
 */
export function calculatePlatformEarnings(input: PlatformEarningsInput): PlatformEarningsCalculated {
  const grossFare = safeNumber(input.grossFare);
  const platformFeePercent = safeNumber(input.platformFeePercent);
  const cashRide = safeNumber(input.cashRide);
  const tips = safeNumber(input.tips);
  const campaigns = safeNumber(input.campaigns);

  const fiftyPercent = round2(grossFare * (DRIVER_SHARE_PERCENT / 100));
  const fee = round2(grossFare * (platformFeePercent / 100));
  const net = round2(fiftyPercent - fee);
  const balance = round2(net - cashRide + tips + campaigns);

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
 * - Total Balance Before Tax = sum of balance for all platforms
 * - Final Balance = Total Balance Before Tax - FSS/Tax
 */
export function calculateSettlement(
  platformInputs: PlatformEarningsInput[],
  fssTax: number
): SettlementCalculation {
  const platforms = platformInputs.map(calculatePlatformEarnings);
  const safeFssTax = safeNumber(fssTax);

  const totalGrossFare = round2(platforms.reduce((sum, p) => sum + p.grossFare, 0));
  const totalFiftyPercent = round2(platforms.reduce((sum, p) => sum + p.fiftyPercent, 0));
  const totalFee = round2(platforms.reduce((sum, p) => sum + p.fee, 0));
  const totalNet = round2(platforms.reduce((sum, p) => sum + p.net, 0));
  const totalCashRide = round2(platforms.reduce((sum, p) => sum + p.cashRide, 0));
  const totalTips = round2(platforms.reduce((sum, p) => sum + p.tips, 0));
  const totalCampaigns = round2(platforms.reduce((sum, p) => sum + p.campaigns, 0));
  const totalBalanceBeforeTax = round2(platforms.reduce((sum, p) => sum + p.balance, 0));
  const finalBalance = round2(totalBalanceBeforeTax - safeFssTax);

  return {
    platforms,
    totalGrossFare,
    totalFiftyPercent,
    totalFee,
    totalNet,
    totalCashRide,
    totalTips,
    totalCampaigns,
    totalBalanceBeforeTax,
    fssTax: round2(safeFssTax),
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
