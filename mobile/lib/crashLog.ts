import AsyncStorage from '@react-native-async-storage/async-storage';

const CRASH_KEY = 'rovora.lastCrash';

export interface CrashReport {
  message: string;
  stack: string;
  fatal: boolean;
  at: string;
}

/**
 * Persist any fatal JS error before the app dies, so we can show it on the
 * next launch instead of crashing silently to the home screen.
 */
export function installCrashLogger() {
  const errorUtils = (globalThis as any).ErrorUtils;
  if (!errorUtils?.setGlobalHandler) return;
  const previous = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    try {
      const report: CrashReport = {
        message: String(error?.message ?? error),
        stack: String(error?.stack ?? ''),
        fatal: !!isFatal,
        at: new Date().toISOString(),
      };
      void AsyncStorage.setItem(CRASH_KEY, JSON.stringify(report));
    } catch {
      // never let the crash logger itself throw
    }
    previous?.(error, isFatal);
  });
}

export async function getLastCrash(): Promise<CrashReport | null> {
  try {
    const raw = await AsyncStorage.getItem(CRASH_KEY);
    return raw ? (JSON.parse(raw) as CrashReport) : null;
  } catch {
    return null;
  }
}

export async function clearLastCrash(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CRASH_KEY);
  } catch {
    // ignore
  }
}
