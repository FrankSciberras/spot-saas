// =============================================================================
// Settlement Configuration
// =============================================================================
// This file contains all configurable values for the driver settlement system.
// Modify these values to change defaults without touching business logic.

/**
 * Platform/Service configuration
 * Add new platforms here - the system will automatically include them
 */
export interface PlatformConfig {
  id: string;
  name: string;
  defaultFeePercent: number;
  icon: string;
  color: string;
}

export const PLATFORMS: PlatformConfig[] = [
  { 
    id: 'bolt', 
    name: 'Bolt', 
    defaultFeePercent: 10, 
    icon: '⚡', 
    color: '#34D186' 
  },
  { 
    id: 'uber', 
    name: 'Uber', 
    defaultFeePercent: 10, 
    icon: '🚗', 
    color: '#000000' 
  },
  { 
    id: 'ecabs', 
    name: 'Ecabs', 
    defaultFeePercent: 10, 
    icon: '🚕', 
    color: '#FFB800' 
  },
];

/**
 * Default FSS/Tax amount (can be overridden per driver or per settlement)
 */
export const DEFAULT_FSS_TAX = 22.00;

/**
 * Get default FSS/Tax amount
 * This could be extended to pull from driver profile in future
 */
export function getDefaultFssTax(): number {
  return DEFAULT_FSS_TAX;
}

/**
 * Get platform config by ID
 */
export function getPlatformConfig(platformId: string): PlatformConfig | undefined {
  return PLATFORMS.find(p => p.id === platformId);
}

/**
 * Currency configuration
 */
export const CURRENCY = {
  symbol: '€',
  code: 'EUR',
  locale: 'en-MT',
};

/**
 * Settlement scheme — the configurable revenue-sharing rules for a fleet.
 *
 * Every value is "how much of X goes to / is borne by the DRIVER", as a
 * percentage (0–100). The defaults in DEFAULT_SCHEME reproduce the original
 * hardcoded behaviour exactly, so nothing changes until an operator edits them.
 *
 * The effective scheme for a settlement is resolved per-driver:
 *   driver override (drivers.*)  ??  fleet default (organizations.*)  ??  DEFAULT_SCHEME
 * and then frozen onto the settlement row (driver_settlements.*) at save time.
 */
export interface SettlementScheme {
  /** Driver's cut of gross fare (%). 50 = the classic 50/50 split. */
  driverSharePct: number;
  /** Share of tips paid to the driver (%). 100 = driver keeps all tips. */
  tipsDriverPct: number;
  /** Share of campaigns paid to the driver (%). 100 = driver keeps all campaigns. */
  campaignsDriverPct: number;
  /** Share of the platform fee borne by the driver (%). 100 = driver absorbs the full fee. */
  feeDriverPct: number;
}

/**
 * The original hardcoded model: 50/50 split, driver keeps all tips & campaigns,
 * driver absorbs the full platform fee. Used as the final fallback.
 */
export const DEFAULT_SCHEME: SettlementScheme = {
  driverSharePct: 50,
  tipsDriverPct: 100,
  campaignsDriverPct: 100,
  feeDriverPct: 100,
};

/**
 * Driver share percentage — kept for back-compat. Prefer DEFAULT_SCHEME.
 */
export const DRIVER_SHARE_PERCENT = DEFAULT_SCHEME.driverSharePct;

/** Clamp any value to a valid 0–100 percentage, falling back to `fallback`. */
export function clampPercent(value: unknown, fallback: number): number {
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(100, Math.max(0, num));
}

/** Loose shape of the fleet-default scheme columns on `organizations`. */
export interface OrgSchemeDefaults {
  settlement_driver_share_pct?: number | null;
  settlement_tips_driver_pct?: number | null;
  settlement_campaigns_driver_pct?: number | null;
  settlement_fee_driver_pct?: number | null;
}

/** Loose shape of the optional per-driver override columns on `drivers`. */
export type DriverSchemeOverrides = OrgSchemeDefaults;

/**
 * Resolve the effective scheme for a driver: per-driver override (if set) wins
 * over the fleet default, which wins over the code default. A value is only
 * "set" when it is neither null nor undefined, so a driver can leave any subset
 * of knobs blank to inherit the fleet number for those.
 */
export function resolveScheme(
  orgDefaults?: OrgSchemeDefaults | null,
  driverOverrides?: DriverSchemeOverrides | null
): SettlementScheme {
  const pick = (
    driverVal: number | null | undefined,
    orgVal: number | null | undefined,
    fallback: number
  ): number => {
    if (driverVal !== null && driverVal !== undefined) return clampPercent(driverVal, fallback);
    if (orgVal !== null && orgVal !== undefined) return clampPercent(orgVal, fallback);
    return fallback;
  };

  return {
    driverSharePct: pick(
      driverOverrides?.settlement_driver_share_pct,
      orgDefaults?.settlement_driver_share_pct,
      DEFAULT_SCHEME.driverSharePct
    ),
    tipsDriverPct: pick(
      driverOverrides?.settlement_tips_driver_pct,
      orgDefaults?.settlement_tips_driver_pct,
      DEFAULT_SCHEME.tipsDriverPct
    ),
    campaignsDriverPct: pick(
      driverOverrides?.settlement_campaigns_driver_pct,
      orgDefaults?.settlement_campaigns_driver_pct,
      DEFAULT_SCHEME.campaignsDriverPct
    ),
    feeDriverPct: pick(
      driverOverrides?.settlement_fee_driver_pct,
      orgDefaults?.settlement_fee_driver_pct,
      DEFAULT_SCHEME.feeDriverPct
    ),
  };
}
