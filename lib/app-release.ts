// =============================================================================
// DRIVER APP RELEASES — which Rovora Driver version drivers must be on
// =============================================================================
// "Latest" is whatever Google Play is actually serving right now (read from the
// public store listing, cached), so drivers are only ever told to update to a
// version they can really download — publish on Play and, within the hour,
// everyone on an older app is asked to update. Fails open: if Play can't be
// read, nobody is blocked.
//
// Overrides (Coolify env, server-side — a restart picks them up):
//   APP_FORCE_UPDATE=off      kill switch: never block anyone
//   APP_MIN_VERSION=1.0.3     force exactly this minimum instead of Play's
//   APP_LATEST_VERSION=1.0.3  skip reading Play
// =============================================================================

export const ANDROID_PACKAGE = 'eu.rovora.driver';
/** Opens the Play Store app on Rovora Driver's page (WebView hands it to Android). */
export const PLAY_STORE_APP_URL = `market://details?id=${ANDROID_PACKAGE}`;
export const PLAY_STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

const VERSION_RE = /^\d+\.\d+\.\d+$/;
const OK_TTL_MS = 60 * 60_000;
const FAIL_TTL_MS = 10 * 60_000;

let cache: { at: number; version: string | null } | null = null;

/** The version Google Play currently serves, or null if it can't be read. */
export async function livePlayVersion(): Promise<string | null> {
  if (cache && Date.now() - cache.at < (cache.version ? OK_TTL_MS : FAIL_TTL_MS)) return cache.version;
  let version: string | null = null;
  try {
    const res = await fetch(`${PLAY_STORE_WEB_URL}&hl=en&gl=MT`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36', 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    if (res.ok) {
      // The listing embeds the current version as [[["1.0.3"]]].
      const match = (await res.text()).match(/\[\[\["(\d+\.\d+\.\d+)"\]\]/);
      version = match?.[1] ?? null;
    }
  } catch {
    // network / timeout — fail open
  }
  cache = { at: Date.now(), version };
  return version;
}

/** Numeric comparison: -1, 0 or 1. */
export function compareVersions(a: string, b: string): number {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export interface AppReleaseInfo {
  /** Newest version available to download, if known. */
  latest: string | null;
  /** Anything below this must update before continuing; null = no one is blocked. */
  minimum: string | null;
}

export async function appReleaseInfo(): Promise<AppReleaseInfo> {
  const envLatest = process.env.APP_LATEST_VERSION?.trim();
  const latest = envLatest && VERSION_RE.test(envLatest) ? envLatest : await livePlayVersion();
  if (process.env.APP_FORCE_UPDATE?.trim().toLowerCase() === 'off') return { latest, minimum: null };
  const envMin = process.env.APP_MIN_VERSION?.trim();
  const minimum = envMin && VERSION_RE.test(envMin) ? envMin : latest;
  return { latest, minimum };
}
