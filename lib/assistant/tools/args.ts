// =============================================================================
// ROVORA AI — reading tool arguments safely
// =============================================================================
// Tool arguments are written by the model, so they are untrusted input: wrong
// types, made-up enum values, huge numbers, or text that tries to smuggle in a
// PostgREST filter. Read every argument through these helpers.
// =============================================================================

/** A trimmed string, or undefined. Long strings are cut. */
export function argString(args: Record<string, unknown>, key: string, maxLen = 80): string | undefined {
  const v = args[key];
  if (typeof v !== 'string') return undefined;
  const s = v.trim().slice(0, maxLen);
  return s || undefined;
}

/** An integer clamped to [min, max], or `fallback`. */
export function argInt(args: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  const v = args[key];
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** One of an allowed set of values, or `fallback`. */
export function argEnum<T extends string>(args: Record<string, unknown>, key: string, allowed: readonly T[], fallback: T): T {
  const v = args[key];
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function argBool(args: Record<string, unknown>, key: string, fallback = false): boolean {
  const v = args[key];
  return typeof v === 'boolean' ? v : fallback;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A UUID (record id), or undefined. Anything else is dropped. */
export function argId(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === 'string' && UUID.test(v.trim()) ? v.trim().toLowerCase() : undefined;
}

/**
 * Text safe to drop into a PostgREST `ilike` / `.or()` pattern: letters,
 * digits, spaces and a few plate/name characters only. Strips `,()*%` and the
 * like so a "name" can't add filter clauses.
 */
export function searchText(value: string | undefined, maxLen = 40): string | undefined {
  if (!value) return undefined;
  const s = value.normalize('NFKC').replace(/[^\p{L}\p{N}\s'.-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLen);
  return s || undefined;
}

/** Cap a list for the model and say how many were left out. */
export function capList<T>(items: T[], max: number): { items: T[]; total: number; truncated: boolean } {
  return { items: items.slice(0, max), total: items.length, truncated: items.length > max };
}

/** Round money to cents (avoids 12.300000000001 in answers). */
export function money(n: number | string | null | undefined): number {
  const v = typeof n === 'string' ? Number(n) : n ?? 0;
  return Number.isFinite(v) ? Math.round((v as number) * 100) / 100 : 0;
}

/** Drop repeated links (same href) from a sources list, keeping the first label. */
export function dedupeSources(sources: { label: string; href: string }[]): { label: string; href: string }[] {
  const seen = new Set<string>();
  return sources.filter((s) => (seen.has(s.href) ? false : (seen.add(s.href), true)));
}
