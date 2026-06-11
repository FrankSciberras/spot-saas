// =============================================================================
// CSV utilities for the settlement earnings importer
// =============================================================================
// Small, dependency-free helpers to parse the weekly per-driver earnings
// exports operators download from platform fleet portals (Bolt, Uber, …).
// Formats vary per platform and locale, so parsing is deliberately tolerant:
// delimiter is auto-detected, numbers accept both 1,234.56 and 1.234,56,
// and driver names are matched fuzzily against the fleet's driver list.

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/** Detect the delimiter by counting candidates outside quotes on the first line. */
function detectDelimiter(firstLine: string): string {
  const candidates = [',', ';', '\t'];
  let best = ',';
  let bestCount = -1;
  for (const d of candidates) {
    let count = 0;
    let inQuotes = false;
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) count++;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Parse CSV text into headers + rows. Handles quoted fields with embedded
 * delimiters/newlines and "" escapes. Empty lines are skipped.
 */
export function parseCsv(text: string): ParsedCsv {
  const clean = text.replace(/^﻿/, ''); // strip BOM
  const firstNewline = clean.indexOf('\n');
  const delimiter = detectDelimiter(firstNewline === -1 ? clean : clean.slice(0, firstNewline));

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);

  const headers = (rows.shift() || []).map((h) => h.trim());
  return { headers, rows };
}

/**
 * Parse a money/number cell tolerantly: strips currency symbols and spaces,
 * accepts both 1,234.56 (EN) and 1.234,56 (EU) — the RIGHTMOST separator is
 * taken as the decimal point when both appear. Returns 0 for blank/invalid.
 */
export function parseLocaleNumber(raw: string): number {
  let s = (raw || '').replace(/[€$£\s]/g, '').trim();
  if (!s) return 0;
  const negative = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()-]/g, '');

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56
    } else {
      s = s.replace(/,/g, ''); // 1,234.56
    }
  } else if (lastComma !== -1) {
    // Only commas: decimal if it looks like one (≤2 trailing digits), else thousands.
    const after = s.length - lastComma - 1;
    s = after <= 2 && s.indexOf(',') === lastComma ? s.replace(',', '.') : s.replace(/,/g, '');
  }

  const num = parseFloat(s);
  if (!Number.isFinite(num)) return 0;
  return negative ? -num : num;
}

/** Normalize a person name for matching: lowercase, no diacritics, single spaces. */
export function normalizeName(name: string): string {
  return (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Match a CSV driver name against the fleet's drivers. Tries, in order:
 * exact normalized match, token-sorted match ("Borg Maria" = "Maria Borg"),
 * then a unique containment match. Returns the driver id or null.
 */
export function matchDriver(
  csvName: string,
  drivers: Array<{ id: string; full_name: string }>
): string | null {
  const target = normalizeName(csvName);
  if (!target) return null;

  const exact = drivers.find((d) => normalizeName(d.full_name) === target);
  if (exact) return exact.id;

  const sortTokens = (n: string) => n.split(' ').sort().join(' ');
  const targetSorted = sortTokens(target);
  const tokenMatch = drivers.find((d) => sortTokens(normalizeName(d.full_name)) === targetSorted);
  if (tokenMatch) return tokenMatch.id;

  const contains = drivers.filter((d) => {
    const n = normalizeName(d.full_name);
    return n.includes(target) || target.includes(n);
  });
  return contains.length === 1 ? contains[0].id : null;
}

/** Guess which column index maps to each field from header keywords. */
export function guessColumns(headers: string[]): {
  driver: number;
  gross: number;
  tips: number;
  cash: number;
  campaigns: number;
} {
  const lower = headers.map((h) => h.toLowerCase());
  const find = (patterns: RegExp[], exclude?: RegExp): number => {
    for (const p of patterns) {
      const idx = lower.findIndex((h) => p.test(h) && (!exclude || !exclude.test(h)));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  return {
    driver: find([/driver/, /\bname\b/, /chauffeur/]),
    gross: find([/gross/, /\bfare\b/, /earning/, /revenue/, /\btotal\b/], /tip|cash|bonus|campaign|fee|net/),
    tips: find([/tip/]),
    cash: find([/cash/]),
    campaigns: find([/campaign/, /bonus/, /promo/, /incentive/, /boost/]),
  };
}
