// =============================================================================
// MONEY — one formatter for every amount a fleet sees
// =============================================================================
// A fleet picks its currency and number style in Settings → General
// (finance.currency / finance.number_format in lib/settings/catalog.ts).
// Everything that shows the fleet's own money formats it through here:
//
//   client:  const money = useMoney();          money(1234.5)  → "€1,234.50"
//   server:  formatMoney(1234.5, moneyFormatFrom(await getFleetSettings(org)))
//   PDFs:    pdfText(formatMoney(…))  — see pdfText below
//
// Not covered on purpose: Rovora's own prices (plans, billing, the platform
// admin console) are charged in euro whatever currency a fleet works in.
//
// Pure module (no React, no server imports) so it runs anywhere.
// =============================================================================

export interface MoneyFormat {
  /** ISO 4217 code, e.g. 'EUR'. */
  currency: string;
  /** Number style as a BCP 47 locale, e.g. 'en-IE' → 1,234.56; 'de-DE' → 1.234,56. */
  locale: string;
}

/** What every fleet used before the setting existed. */
export const DEFAULT_MONEY_FORMAT: MoneyFormat = { currency: 'EUR', locale: 'en-IE' };

export interface MoneyOptions {
  /** Digits after the decimal point (default 2; currencies without cents, like JPY, use 0). */
  decimals?: number;
  /** Shorten large amounts: €12.5K. */
  compact?: boolean;
  /** Drop the decimals on whole amounts: €22 rather than €22.00 (labels and summaries). */
  trim?: boolean;
}

/** Older helpers took the number of decimals as a bare second argument. */
export type MoneyOptionsArg = MoneyOptions | number | undefined;

const cache = new Map<string, Intl.NumberFormat>();

function formatter(fmt: MoneyFormat, decimals: number, compact: boolean): Intl.NumberFormat {
  const key = `${fmt.locale}|${fmt.currency}|${decimals}|${compact}`;
  let f = cache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(fmt.locale, {
        style: 'currency',
        currency: fmt.currency,
        ...(compact
          ? { notation: 'compact', compactDisplay: 'short', maximumFractionDigits: 1 }
          : { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
      });
    } catch {
      // Unknown currency or locale in stored data: fall back rather than crash a page.
      f = new Intl.NumberFormat(DEFAULT_MONEY_FORMAT.locale, {
        style: 'currency',
        currency: DEFAULT_MONEY_FORMAT.currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    }
    cache.set(key, f);
  }
  return f;
}

/** Digits the currency normally uses (2 for EUR, 0 for JPY/HUF-style amounts). */
export function currencyDecimals(fmt: MoneyFormat): number {
  try {
    return new Intl.NumberFormat(fmt.locale, { style: 'currency', currency: fmt.currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** "€1,234.56", "-€12.00", "1.234,56 €", "CHF 1’234.56" — in the fleet's currency and style. */
export function formatMoney(value: number, fmt: MoneyFormat = DEFAULT_MONEY_FORMAT, opts: MoneyOptionsArg = {}): string {
  const o: MoneyOptions = typeof opts === 'number' ? { decimals: opts } : opts ?? {};
  const n = Number.isFinite(value) ? value : 0;
  let decimals = o.decimals ?? 2;
  if (o.trim && Number.isInteger(Number(n.toFixed(decimals)))) decimals = 0;
  // Compact only pays off from four digits up; below that show the plain amount.
  const compact = !!o.compact && Math.abs(n) >= 1000;
  // Avoid "-€0.00" for amounts that round to zero.
  const rounded = compact ? n : Number(n.toFixed(decimals));
  return formatter(fmt, decimals, compact).format(Object.is(rounded, -0) ? 0 : rounded);
}

/** The amount in the fleet's number style without the currency: "1,234.56", "1.234,56". */
export function formatMoneyNumber(value: number, fmt: MoneyFormat = DEFAULT_MONEY_FORMAT, decimals = 2): string {
  const n = Number.isFinite(value) ? Number(value.toFixed(decimals)) : 0;
  let f: Intl.NumberFormat;
  try {
    f = new Intl.NumberFormat(fmt.locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  } catch {
    f = new Intl.NumberFormat(DEFAULT_MONEY_FORMAT.locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  return f.format(Object.is(n, -0) ? 0 : n);
}

/** Just the symbol, for labels like "Rent (€ per week)": "€", "£", "CHF", "zł". */
export function moneySymbol(fmt: MoneyFormat = DEFAULT_MONEY_FORMAT): string {
  try {
    const parts = new Intl.NumberFormat(fmt.locale, { style: 'currency', currency: fmt.currency }).formatToParts(1);
    return parts.find((p) => p.type === 'currency')?.value ?? fmt.currency;
  } catch {
    return fmt.currency;
  }
}

/** The fleet's format from its settings. */
export function moneyFormatFrom(settings: { 'finance.currency': string; 'finance.number_format': string }): MoneyFormat {
  return { currency: settings['finance.currency'], locale: settings['finance.number_format'] };
}

/**
 * Text that's safe for the embedded PDF font (Geist). Some number styles
 * (e.g. French) use a narrow no-break space between thousands, which Geist
 * doesn't have; swap it for an ordinary no-break space.
 */
export function pdfText(text: string): string {
  return text.replace(/ /g, ' ');
}
