// =============================================================================
// WHY ISN'T THIS DRIVER SHARING? — reasons for the Live Map's "not sharing" box
// =============================================================================
// Turns what Rovora knows about an on-shift driver's phone into one plain
// reason for the fleet owner, plus what to tell the driver. Sources, freshest
// and most specific first:
//   * driver_app_status — what the Rovora Driver app last reported (its own
//     location check and "Not now" taps from app 1.0.3, errors, and whether the
//     portal was last opened in the app or in a plain browser);
//   * the last tracking event this shift (they switched sharing off);
//   * driver_positions — phone state from the last time they DID share.
// Pure function, no I/O: the Live Map calls it on every render.
// =============================================================================

export interface AppStatusInfo {
  appSeenAt: string | null;
  browserSeenAt: string | null;
  platform: string | null;
  appVersion: string | null;
  tracking: boolean | null;
  lastSentAt: string | null;
  lastError: string | null;
  locationAccess: string | null;
  accessCheckedAt: string | null;
  promptDismissedAt: string | null;
  autoRestartedAt: string | null;
  updatedAt: string | null;
}

export interface LastPositionInfo {
  recordedAt: string;
  gpsEnabled: boolean | null;
  locationPermission: string | null;
}

export interface SharingInputs {
  shiftStart: string;
  app?: AppStatusInfo;
  /** Latest started/stopped event since the shift began. */
  lastTrackingEvent?: { event: string; at: string };
  /** Their latest stored position, if they've ever shared. */
  position?: LastPositionInfo;
  now: number;
}

export interface SharingDiagnosis {
  /** neg = a setting blocks it; warn = a choice/omission; info = can't tell yet. */
  tone: 'neg' | 'warn' | 'info';
  title: string;
  detail?: string;
  /** What the fleet should ask the driver to do. */
  fix: string;
  /** The same, said to the driver (WhatsApp / alert text). */
  tell: string;
  /** "App 1.0.3 · Android · opened 4 min ago" */
  meta?: string;
}

const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || 'Europe/Malta';

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' });
}

function ago(iso: string, now: number): string {
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** Phone-specific wording for the settings a driver has to change. */
function settingsPath(platform: string | null, what: 'always' | 'precise'): string {
  const ios = platform === 'ios';
  if (what === 'precise') {
    return ios ? 'Settings → Rovora Driver → Location → turn on Precise Location' : 'Settings → Apps → Rovora Driver → Permissions → Location → turn on “Use precise location”';
  }
  return ios ? 'Settings → Rovora Driver → Location → Always' : 'Settings → Apps → Rovora Driver → Permissions → Location → “Allow all the time”';
}

function metaLine(app: AppStatusInfo | undefined, now: number): string | undefined {
  if (!app) return undefined;
  const parts: string[] = [];
  if (app.appSeenAt) {
    parts.push(app.appVersion ? `App ${app.appVersion}` : 'Rovora Driver app');
    if (app.platform) parts.push(app.platform === 'ios' ? 'iPhone' : 'Android');
    parts.push(`opened ${ago(app.appSeenAt, now)}`);
  }
  if (app.autoRestartedAt && now - Date.parse(app.autoRestartedAt) < 12 * 3600_000) {
    parts.push(`sharing restarted itself at ${clock(app.autoRestartedAt)}`);
  }
  if (app.browserSeenAt && (!app.appSeenAt || Date.parse(app.browserSeenAt) > Date.parse(app.appSeenAt))) {
    parts.push(`website in a browser ${ago(app.browserSeenAt, now)}`);
  }
  return parts.length ? parts.join(' · ') : undefined;
}

export function diagnoseNotSharing({ shiftStart, app, lastTrackingEvent, position, now }: SharingInputs): SharingDiagnosis {
  const start = Date.parse(shiftStart);
  const during = (iso: string | null | undefined): iso is string => !!iso && Date.parse(iso) >= start;
  const meta = metaLine(app, now);
  const platform = app?.platform ?? null;
  const openApp = 'Ask them to open the Rovora Driver app — it checks their location settings and starts sharing.';

  // 1. The app's own location check this shift (app 1.0.3+) — the most exact.
  if (app && during(app.accessCheckedAt) && app.locationAccess && app.locationAccess !== 'ok') {
    const at = clock(app.accessCheckedAt);
    switch (app.locationAccess) {
      case 'services_off':
        return {
          tone: 'neg',
          title: 'Location is switched off on their phone',
          detail: `The app found the phone’s location (GPS) turned off at ${at}.`,
          fix: platform === 'ios'
            ? 'Ask them to turn on Settings → Privacy & Security → Location Services.'
            : 'Ask them to swipe down from the top of the screen and turn on Location.',
          tell: 'Location is switched off on your phone. Please turn it on, then open Rovora Driver.',
          meta,
        };
      case 'no_permission':
        return {
          tone: 'neg',
          title: 'Rovora Driver isn’t allowed to use location',
          detail: `They haven’t given the app location permission (checked ${at}).`,
          fix: `Ask them to set ${settingsPath(platform, 'always')}.`,
          tell: `Rovora Driver isn’t allowed to use your location. Please go to ${settingsPath(platform, 'always')}.`,
          meta,
        };
      case 'not_always':
        return {
          tone: 'neg',
          title: 'Location only allowed while the app is open',
          detail: 'Sharing would stop as soon as the phone locks or they switch apps, so it hasn’t started.',
          fix: `Ask them to set ${settingsPath(platform, 'always')}.`,
          tell: `Your location is only allowed while Rovora Driver is open. Please go to ${settingsPath(platform, 'always')}.`,
          meta,
        };
      case 'approximate':
        return {
          tone: 'warn',
          title: 'Precise location is turned off',
          detail: 'The phone only gives a rough area, and they haven’t started sharing.',
          fix: `Ask them to set ${settingsPath(platform, 'precise')}, then tap Share location in the app.`,
          tell: `Precise location is off on your phone. Please go to ${settingsPath(platform, 'precise')}, then tap Share location in Rovora Driver.`,
          meta,
        };
    }
  }

  // 2. They were asked to share and said "Not now" (app 1.0.3+).
  if (app && during(app.promptDismissedAt)) {
    return {
      tone: 'warn',
      title: `Tapped “Not now” when asked to share (${clock(app.promptDismissedAt)})`,
      detail: 'Their location settings are fine — they chose not to share yet. The app asks again every few minutes.',
      fix: 'Ask them to open Rovora Driver and tap “Share location”.',
      tell: 'Please open Rovora Driver and tap “Share location”.',
      meta,
    };
  }

  // 3. They switched sharing off during this shift.
  if (lastTrackingEvent?.event === 'stopped' && during(lastTrackingEvent.at)) {
    return {
      tone: 'warn',
      title: `Turned sharing off at ${clock(lastTrackingEvent.at)}`,
      detail: 'They were sharing earlier in this shift, then stopped it from the app.',
      fix: 'Ask them to open Rovora Driver and tap “Share location”.',
      tell: 'Please open Rovora Driver and tap “Share location”.',
      meta,
    };
  }

  // 4. The app hit an error it told us about.
  if (app?.lastError && during(app.updatedAt)) {
    const signedOut = /signed out|sign in/i.test(app.lastError);
    return {
      tone: 'neg',
      title: signedOut ? 'The app is signed out' : 'The app reported a problem',
      detail: `“${app.lastError}”`,
      fix: signedOut
        ? 'Ask them to open Rovora Driver and sign in again.'
        : 'Ask them to close Rovora Driver completely and open it again.',
      tell: signedOut
        ? 'Rovora Driver is signed out on your phone. Please open it and sign in again.'
        : 'Rovora Driver hit a problem on your phone. Please close it completely and open it again.',
      meta,
    };
  }

  // 5. Using the website in a browser, not the app, this shift.
  if (app && during(app.browserSeenAt) && !during(app.appSeenAt)) {
    return {
      tone: 'warn',
      title: 'Using the website in a browser, not the app',
      detail: 'A web browser can’t share location in the background — only the Rovora Driver app can.',
      fix: app.appSeenAt
        ? 'They have the app — ask them to use Rovora Driver for their shifts instead of the website.'
        : 'Ask them to install Rovora Driver from Google Play, sign in, and start their shifts from the app.',
      tell: 'The website can’t share your location. Please use the Rovora Driver app (Google Play) for your shifts.',
      meta,
    };
  }

  // 6. The app is open this shift but hasn't said why it isn't sharing.
  if (app && during(app.appSeenAt)) {
    if (!app.appVersion) {
      return {
        tone: 'warn',
        title: 'App open, but not sharing — older app version',
        detail: 'Their version of Rovora Driver doesn’t report the reason. Most often location isn’t set to “Allow all the time”.',
        fix: 'Ask them to update Rovora Driver in Google Play and open it — it will walk them through fixing location.',
        tell: 'Please update Rovora Driver in Google Play and open it — it will show you how to turn on location sharing.',
        meta,
      };
    }
    return {
      tone: 'warn',
      title: 'App open, but sharing hasn’t started',
      detail: app.locationAccess === 'ok' ? 'Their location settings look fine.' : undefined,
      fix: 'Ask them to tap “Share location” in Rovora Driver.',
      tell: 'Please open Rovora Driver and tap “Share location”.',
      meta,
    };
  }

  // 7. What their phone looked like the last time they did share.
  if (position && (position.gpsEnabled === false || position.locationPermission === 'denied' || position.locationPermission === 'foreground_only')) {
    const when = ago(position.recordedAt, now);
    if (position.gpsEnabled === false) {
      return { tone: 'neg', title: 'Location was switched off on their phone', detail: `Last seen that way ${when}.`, fix: 'Ask them to turn Location on and open Rovora Driver.', tell: 'Location is switched off on your phone. Please turn it on, then open Rovora Driver.', meta };
    }
    return {
      tone: 'neg',
      title: position.locationPermission === 'denied' ? 'Rovora Driver lost location permission' : 'Location only allowed while the app is open',
      detail: `Last seen that way ${when}.`,
      fix: `Ask them to set ${settingsPath(platform, 'always')}.`,
      tell: `Rovora Driver can’t use your location all the time. Please go to ${settingsPath(platform, 'always')}.`,
      meta,
    };
  }

  // 8. Known to Rovora, but nothing from their phone since the shift began.
  if (app?.appSeenAt) {
    return {
      tone: 'info',
      title: 'Hasn’t opened the Rovora Driver app this shift',
      detail: 'Sharing only starts once the app is open on their phone.',
      fix: openApp,
      tell: 'Please open the Rovora Driver app — it checks your location settings and starts sharing.',
      meta,
    };
  }
  if (app?.browserSeenAt) {
    return {
      tone: 'warn',
      title: 'Only ever used the website, never the app',
      detail: 'A web browser can’t share location in the background — only the Rovora Driver app can.',
      fix: 'Ask them to install Rovora Driver from Google Play, sign in, and start their shifts from the app.',
      tell: 'Please install Rovora Driver from Google Play, sign in, and keep it open during your shifts.',
      meta,
    };
  }
  if (position) {
    return {
      tone: 'info',
      title: 'Nothing from their phone this shift',
      detail: `They last shared location ${ago(position.recordedAt, now)}.`,
      fix: openApp,
      tell: 'Please open the Rovora Driver app — it checks your location settings and starts sharing.',
      meta,
    };
  }
  return {
    tone: 'info',
    title: 'Their phone has never shared location',
    detail: 'Usually they don’t have the Rovora Driver app yet, or haven’t opened it.',
    fix: 'Ask them to install Rovora Driver from Google Play, sign in, and keep it open on shift.',
    tell: 'Please install Rovora Driver from Google Play, sign in, and keep it open during your shifts.',
    meta,
  };
}

// ─── Sharing, then quiet ─────────────────────────────────────────────────────

/** First app version that keeps sending while the car is parked. */
export const HEARTBEAT_APP_VERSION = '1.0.3';

/** "1.0.10" >= "1.0.3" — numeric, not string, comparison. */
export function versionAtLeast(version: string | null | undefined, min: string): boolean {
  if (!version) return false;
  const a = version.split('.').map(Number);
  const b = min.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true;
}

export interface SilentInputs {
  lastPosition: { recordedAt: string; speed: number | null; batteryPct: number | null; batteryCharging: boolean | null };
  app?: AppStatusInfo;
  now: number;
}

/** An on-shift driver whose phone WAS sharing and has gone quiet. */
export function diagnoseSilent({ lastPosition, app, now }: SilentInputs): SharingDiagnosis {
  const mins = Math.max(1, Math.round((now - Date.parse(lastPosition.recordedAt)) / 60_000));
  const moving = lastPosition.speed != null && lastPosition.speed > 1.5;
  const last = `Last location ${clock(lastPosition.recordedAt)}${moving ? `, moving at ${Math.round((lastPosition.speed as number) * 3.6)} km/h` : ', not moving'}.`;
  const meta = metaLine(app, now);
  const title = `No location for ${mins >= 90 ? `${Math.round(mins / 60)} h` : `${mins} min`}`;
  const battery = 'set Rovora Driver’s battery setting to “Unrestricted” (Settings → Apps → Rovora Driver → Battery)';

  if (lastPosition.batteryPct != null && lastPosition.batteryPct <= 15 && !lastPosition.batteryCharging) {
    return {
      tone: 'neg',
      title: `${title} — battery was at ${lastPosition.batteryPct}%`,
      detail: `${last} The phone has probably run out of battery.`,
      fix: 'Ask them to charge their phone and open Rovora Driver.',
      tell: 'Rovora isn’t receiving your location — your phone battery was very low. Please charge it and open Rovora Driver.',
      meta,
    };
  }
  if (!versionAtLeast(app?.appVersion, HEARTBEAT_APP_VERSION)) {
    return {
      tone: 'info',
      title,
      detail: `${last} Their version of the app only sends while the car moves — if they’re parked at a rank, this is normal.`,
      fix: 'If they should be driving, ask them to open Rovora Driver. Updating the app (Google Play) shows parked drivers as “Parked” instead.',
      tell: 'Rovora isn’t receiving your location. Please open Rovora Driver, and update it in Google Play when you can.',
      meta,
    };
  }
  return {
    tone: 'neg',
    title,
    detail: `${last} The phone stopped sending — usually it closed the app to save battery, has no mobile data, or is switched off.`,
    fix: `Ask them to open Rovora Driver — sharing restarts by itself. To stop it happening, ${battery}.`,
    tell: `Rovora isn’t receiving your location. Please open Rovora Driver — sharing restarts by itself. To stop this happening, ${battery}.`,
    meta,
  };
}
