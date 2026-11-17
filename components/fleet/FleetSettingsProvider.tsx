'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { saveFleetSettingsAction, savePreferencesAction } from '@/lib/actions/settings';
import {
  FLEET_DEFAULTS,
  USER_DEFAULTS,
  type FleetSettingKey,
  type FleetSettings,
  type UserPreferenceKey,
  type UserPreferences,
} from '@/lib/settings/catalog';
import type { StoredValue } from '@/lib/settings/types';

// =============================================================================
// Carries the fleet's settings and the signed-in person's preferences from the
// /fleet layout (read on the server) down to client pages.
//
//   useFleetSetting('documents.expiry_warning_days')   → 30
//   usePreference('appearance.theme')                  → 'dark'
//   useSetPreference()('appearance.theme', 'light')    → saves, UI updates now
//
// Saves update the UI straight away and roll back if the server refuses.
// =============================================================================

export interface ResolvedPayload<T> {
  values: T;
  overridden: string[];
}

interface Ctx {
  fleet: ResolvedPayload<FleetSettings>;
  prefs: ResolvedPayload<UserPreferences>;
  saveFleet: (patch: Partial<Record<FleetSettingKey, StoredValue | null>>) => Promise<string | null>;
  savePrefs: (patch: Partial<Record<UserPreferenceKey, StoredValue | null>>) => Promise<string | null>;
}

const SettingsContext = createContext<Ctx | null>(null);

/** Local copy of server state that follows new server props and can be patched optimistically. */
function useSynced<T>(fromServer: ResolvedPayload<T>) {
  const [state, setState] = useState(fromServer);
  const [seen, setSeen] = useState(fromServer);
  if (seen !== fromServer) {
    setSeen(fromServer);
    setState(fromServer);
  }
  const ref = useRef(state);
  useEffect(() => { ref.current = state; }, [state]);
  return [state, setState, ref] as const;
}

export function FleetSettingsProvider({
  fleet: fleetFromServer,
  prefs: prefsFromServer,
  children,
}: {
  fleet: ResolvedPayload<FleetSettings>;
  prefs: ResolvedPayload<UserPreferences>;
  children: ReactNode;
}) {
  const [fleet, setFleet, fleetRef] = useSynced(fleetFromServer);
  const [prefs, setPrefs, prefsRef] = useSynced(prefsFromServer);

  const saveFleet = useCallback<Ctx['saveFleet']>(async (patch) => {
    const before = fleetRef.current;
    setFleet((s) => applyPatch(s, patch, FLEET_DEFAULTS));
    const res = await saveFleetSettingsAction(patch);
    if (res.error) { setFleet(before); return res.error; }
    if (res.values) setFleet({ values: res.values as unknown as FleetSettings, overridden: res.overridden ?? [] });
    return null;
  }, [fleetRef, setFleet]);

  const savePrefs = useCallback<Ctx['savePrefs']>(async (patch) => {
    const before = prefsRef.current;
    setPrefs((s) => applyPatch(s, patch, USER_DEFAULTS));
    const res = await savePreferencesAction(patch);
    if (res.error) { setPrefs(before); return res.error; }
    if (res.values) setPrefs({ values: res.values as unknown as UserPreferences, overridden: res.overridden ?? [] });
    return null;
  }, [prefsRef, setPrefs]);

  const value = useMemo(() => ({ fleet, prefs, saveFleet, savePrefs }), [fleet, prefs, saveFleet, savePrefs]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

function applyPatch<T>(s: ResolvedPayload<T>, patch: Record<string, StoredValue | null | undefined>, defaults: T): ResolvedPayload<T> {
  const values = { ...s.values } as Record<string, unknown>;
  const overridden = new Set(s.overridden);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const def = (defaults as Record<string, unknown>)[k];
    values[k] = v === null ? def : v;
    if (v === null || v === def) overridden.delete(k);
    else overridden.add(k);
  }
  return { values: values as T, overridden: Array.from(overridden) };
}

const NO_FLEET: ResolvedPayload<FleetSettings> = { values: FLEET_DEFAULTS, overridden: [] };
const NO_PREFS: ResolvedPayload<UserPreferences> = { values: USER_DEFAULTS, overridden: [] };
const unavailable = async () => 'Settings are not available here.';

/** All fleet settings (catalog defaults outside the provider). */
export function useFleetSettings(): FleetSettings {
  return useContext(SettingsContext)?.fleet.values ?? FLEET_DEFAULTS;
}

export function useFleetSetting<K extends FleetSettingKey>(key: K): FleetSettings[K] {
  return useFleetSettings()[key];
}

export function usePreferences(): UserPreferences {
  return useContext(SettingsContext)?.prefs.values ?? USER_DEFAULTS;
}

export function usePreference<K extends UserPreferenceKey>(key: K): UserPreferences[K] {
  return usePreferences()[key];
}

/** Change one of your own preferences. Resolves to an error message or null. */
export function useSetPreference() {
  const save = useContext(SettingsContext)?.savePrefs;
  return useCallback(
    <K extends UserPreferenceKey>(key: K, value: UserPreferences[K]) => (save ? save({ [key]: value } as Partial<Record<UserPreferenceKey, StoredValue>>) : unavailable()),
    [save]
  );
}

/** Everything the Settings page needs: values, what's changed, and savers. */
export function useSettingsAdmin() {
  const ctx = useContext(SettingsContext);
  return {
    fleet: ctx?.fleet ?? NO_FLEET,
    prefs: ctx?.prefs ?? NO_PREFS,
    saveFleet: ctx?.saveFleet ?? unavailable,
    savePrefs: ctx?.savePrefs ?? unavailable,
  };
}

/** Where maps open before there's anything to show (Settings → Live Map → Map). */
export function useMapStartView(): { center: [number, number]; zoom: number } {
  const f = useFleetSettings();
  const lat = f['tracking.map_center_lat'];
  const lng = f['tracking.map_center_lng'];
  const zoom = f['tracking.map_zoom'];
  return useMemo(() => ({ center: [lat, lng] as [number, number], zoom }), [lat, lng, zoom]);
}
