// =============================================================================
// Settlement Configuration
// =============================================================================
// This file contains all configurable values for the driver settlement system.
// Modify these values to change defaults without touching business logic.

/**
 * Platform/Service configuration.
 *
 * Platforms are per-fleet data now (org_platforms table, editable in
 * Settlement Rules). The PLATFORMS constant below is only the FALLBACK for
 * orgs with zero platform rows (e.g. migration not applied yet) — it matches
 * what seed_default_platforms() seeds.
 */
export interface PlatformConfig {
  id: string;
  name: string;
  defaultFeePercent: number;
  icon: string;
  color: string;
}

/** Loose shape of an org_platforms row (structural, for partial selects). */
export interface OrgPlatformLike {
  key: string;
  name: string;
  default_fee_pct: number;
  icon: string;
  color: string;
}

/**
 * Resolve the platform list for a fleet: its org_platforms rows when any
 * exist, otherwise the hardcoded defaults.
 */
export function resolvePlatforms(rows: OrgPlatformLike[] | null | undefined): PlatformConfig[] {
  if (!rows || rows.length === 0) return PLATFORMS;
  return rows.map((r) => ({
    id: r.key,
    name: r.name,
    defaultFeePercent: clampPercent(r.default_fee_pct, 10),
    icon: r.icon || '🚗',
    color: r.color || '#2bbd7e',
  }));
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

/**
 * Settlement components — the toggleable "columns" of a settlement.
 *
 * Every line that contributes to (or is deducted from) a driver's pay is a
 * component that can be switched on/off per preset, so the same engine covers
 * the Malta-style revenue split, a plain hourly/fixed wage, or any mix:
 *   share     — driver's % of gross fares
 *   fee       — platform fee borne by the driver (deduction)
 *   cash      — cash collected by the driver (deduction)
 *   tips      — tips line (addition)
 *   campaigns — campaign bonuses line (addition)
 *   hours     — hourly wage: hourly_rate × hours worked (addition)
 *   fixed     — fixed weekly wage (addition)
 *   tax       — FSS/tax withholding (deduction)
 *   rent      — weekly vehicle rent (deduction)
 */
export type SettlementComponentKey =
  | 'share'
  | 'fee'
  | 'cash'
  | 'tips'
  | 'campaigns'
  | 'hours'
  | 'fixed'
  | 'tax'
  | 'rent';

export type SettlementComponents = Record<SettlementComponentKey, boolean>;

/**
 * Legacy defaults: the classic split lines on, wage lines off — so presets and
 * settlements stored before components existed ('{}') behave exactly as before.
 */
export const DEFAULT_COMPONENTS: SettlementComponents = {
  share: true,
  fee: true,
  cash: true,
  tips: true,
  campaigns: true,
  hours: false,
  fixed: false,
  tax: true,
  rent: true,
};

export const COMPONENT_KEYS = Object.keys(DEFAULT_COMPONENTS) as SettlementComponentKey[];

/** Display metadata for the settings UI (grouped checkboxes). */
export const COMPONENT_META: {
  key: SettlementComponentKey;
  label: string;
  hint: string;
  group: 'earnings' | 'deductions';
}[] = [
  { key: 'share', label: 'Share of fares', hint: 'Driver earns a % of gross fares', group: 'earnings' },
  { key: 'hours', label: 'Hourly wage', hint: 'Hours worked × hourly rate (hours prefill from shifts)', group: 'earnings' },
  { key: 'fixed', label: 'Fixed weekly wage', hint: 'A flat amount every settlement', group: 'earnings' },
  { key: 'tips', label: 'Tips', hint: 'Tips line on the settlement', group: 'earnings' },
  { key: 'campaigns', label: 'Campaigns', hint: 'Platform campaign bonuses', group: 'earnings' },
  { key: 'fee', label: 'Platform fee', hint: 'Driver bears (part of) the platform commission', group: 'deductions' },
  { key: 'cash', label: 'Cash collected', hint: 'Cash the driver already holds is deducted', group: 'deductions' },
  { key: 'tax', label: 'FSS / Tax', hint: 'Tax withholding line', group: 'deductions' },
  { key: 'rent', label: 'Weekly rent', hint: 'Fixed weekly vehicle rent', group: 'deductions' },
];

/**
 * Resolve stored component toggles (jsonb, possibly partial/null) against the
 * defaults. Unknown keys are ignored; missing keys fall back to the default.
 */
export function resolveComponents(raw: unknown): SettlementComponents {
  const result = { ...DEFAULT_COMPONENTS };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const key of COMPONENT_KEYS) {
      const v = (raw as Record<string, unknown>)[key];
      if (typeof v === 'boolean') result[key] = v;
    }
  }
  return result;
}

/**
 * Loose shape of a settlement preset row (lib/types SettlementPreset), accepted
 * here structurally so callers can pass partial selects.
 */
export interface PresetLike {
  driver_share_pct: number;
  tips_driver_pct: number;
  campaigns_driver_pct: number;
  fee_driver_pct: number;
  tax_type: 'flat' | 'percent';
  tax_value: number;
  rent_weekly: number;
  /** Wage fields + toggles (optional: rows predating the pay-models migration). */
  hourly_rate?: number | null;
  fixed_wage_weekly?: number | null;
  components?: unknown;
}

/** Build a SettlementScheme from a preset row, clamping every percentage. */
export function schemeFromPreset(preset: PresetLike): SettlementScheme {
  return {
    driverSharePct: clampPercent(preset.driver_share_pct, DEFAULT_SCHEME.driverSharePct),
    tipsDriverPct: clampPercent(preset.tips_driver_pct, DEFAULT_SCHEME.tipsDriverPct),
    campaignsDriverPct: clampPercent(preset.campaigns_driver_pct, DEFAULT_SCHEME.campaignsDriverPct),
    feeDriverPct: clampPercent(preset.fee_driver_pct, DEFAULT_SCHEME.feeDriverPct),
  };
}

/**
 * Default FSS/tax for a new settlement under a preset.
 *
 * Flat tax keeps the long-standing employment-type rule (only full-time drivers
 * are prefilled with the flat amount; part-time/terminated get 0). Percent tax
 * is computed from the balance before tax by the caller, so it returns null
 * here ("derive it live").
 */
export function presetFlatTax(
  preset: PresetLike,
  employmentType: string | null | undefined
): number | null {
  if (preset.tax_type === 'percent') return null;
  return employmentType === 'full_time' ? Math.max(0, preset.tax_value) : 0;
}

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
