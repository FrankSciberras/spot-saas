import { AppState, Linking, Platform } from 'react-native';
import * as Location from 'expo-location';

/**
 * What stands between the driver and background tracking, checked in this
 * order. null from checkLocationAccess() = all set: location switched on,
 * "Allow all the time" / "Always", and precise location.
 */
export type LocationProblem = 'services_off' | 'no_permission' | 'not_always' | 'approximate';

export const ALWAYS_LABEL = Platform.OS === 'ios' ? 'Always' : 'Allow all the time';
export const PRECISE_LABEL = Platform.OS === 'ios' ? 'Precise Location' : 'Use precise location';

/** Read-only check — never shows a prompt. */
export async function checkLocationAccess(): Promise<LocationProblem | null> {
  if (!(await Location.hasServicesEnabledAsync())) return 'services_off';
  const fg = await Location.getForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'no_permission';
  const bg = await Location.getBackgroundPermissionsAsync();
  if (bg.status !== 'granted') return 'not_always';
  if (fg.android?.accuracy === 'coarse' || fg.ios?.accuracy === 'reduced') return 'approximate';
  return null;
}

/** Shown on the web Share Location page when the driver dismisses the fix. */
export function problemMessage(problem: LocationProblem): string {
  switch (problem) {
    case 'services_off':
      return 'Location is switched off on this phone.';
    case 'no_permission':
      return 'Location permission not granted.';
    case 'not_always':
      return `Location is not set to "${ALWAYS_LABEL}".`;
    case 'approximate':
      return `${PRECISE_LABEL} is off — your position on the map is approximate.`;
  }
}

/**
 * Run a system request and report whether the OS actually showed anything.
 * A dialog or settings page takes the app out of the 'active' state; when the
 * OS won't ask again (denied before, or iOS's one-time "Always" prompt already
 * used) the request returns without that, and only Settings can fix it.
 */
async function promptShown(request: () => Promise<unknown>): Promise<boolean> {
  let shown = false;
  const sub = AppState.addEventListener('change', (state) => {
    if (state !== 'active') shown = true;
  });
  try {
    await request();
  } catch {
    // declined (enableNetworkProviderAsync rejects) — the caller re-checks
  } finally {
    sub.remove();
  }
  return shown;
}

/**
 * Take the driver to whatever fixes `problem`: the system prompt while the OS
 * will still show one, otherwise the app's location settings. Resolves once
 * the prompt closes or Settings has opened; the caller re-checks then, and
 * again when the app comes back to the foreground.
 */
export async function fixLocationAccess(problem: LocationProblem): Promise<void> {
  switch (problem) {
    case 'services_off':
      if (Platform.OS === 'android') {
        // Google Play services' one-tap "Turn on location" dialog.
        if (await promptShown(() => Location.enableNetworkProviderAsync())) return;
        try {
          await Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
          return;
        } catch {
          // no location settings screen — fall back to the app's settings
        }
      }
      // iOS can't deep-link to Location Services; the modal says where to go.
      return Linking.openSettings();

    case 'no_permission': {
      const fg = await Location.getForegroundPermissionsAsync();
      if (fg.canAskAgain && (await promptShown(() => Location.requestForegroundPermissionsAsync()))) {
        // Allowed "while using"? Carry straight on to "all the time" in the same tap.
        if ((await Location.getForegroundPermissionsAsync()).status === 'granted') {
          return fixLocationAccess('not_always');
        }
        return;
      }
      return Linking.openSettings();
    }

    case 'not_always':
      // Android 11+ opens the app's location settings page here; iOS shows its
      // "Change to Always Allow" prompt, but only once ever.
      if (await promptShown(() => Location.requestBackgroundPermissionsAsync())) return;
      return Linking.openSettings();

    case 'approximate':
      // Precise location is a toggle on the app's location settings page.
      return Linking.openSettings();
  }
}
