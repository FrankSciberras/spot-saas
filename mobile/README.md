# Rovora Driver (mobile app)

Native driver app: sign in with the same Supabase account as the web portal, share
live location during shifts (works in the background — the one thing the web can't do),
and use the existing web portal for everything else via the Portal tab.

Locations are written straight to the `driver_positions` / `driver_locations` tables
(migration `20260614_driver_tracking.sql`) and appear on the fleet dashboard's
**Live Map** in real time.

## Structure

- `App.tsx` — auth gate + Shift / Portal tabs
- `lib/supabase.ts` — Supabase client (AsyncStorage session persistence)
- `lib/locationTask.ts` — background location task + start/stop helpers
- `screens/TrackScreen.tsx` — disclosure → permissions → background tracking toggle
- `screens/PortalScreen.tsx` — WebView of rovora.eu/driver (driver signs in once there too)
- `.env` — `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_PORTAL_URL`

## Run it (development)

> ⚠️ **Background location does NOT work in Expo Go.** You need a development build.
> Login, the Portal tab, and foreground UI work in Expo Go for quick iteration, but
> tapping "Start sharing" requires a dev build.

Quick UI iteration (Expo Go):

```
cd mobile
npx expo start
```

Real test with background tracking — pick one:

**A. Cloud build with EAS (no Android Studio / Mac needed):**

```
npm i -g eas-cli
eas login                      # free Expo account
eas build:configure
eas build --profile development --platform android
```

Install the resulting APK on a phone, then `npx expo start` and connect.

**B. Local Android build** (requires Android Studio + SDK):

```
npx expo run:android
```

iOS requires a Mac or an EAS cloud build (`--platform ios`, needs the Apple
Developer account).

## Testing the flow

1. Sign in as a driver account.
2. Shift tab → Start sharing → accept the disclosure → grant location
   ("Allow all the time" on Android).
3. Open the fleet dashboard → Live Map: the marker appears within ~15s and keeps
   updating with the phone locked.

## Release builds (app stores)

```
eas build --profile production --platform all
eas submit --platform android
eas submit --platform ios
```

Store checklist (background location is reviewed strictly):
- Privacy policy URL on rovora.eu covering location collection.
- Google Play: Background Location declaration form + a short screen-recording of
  the in-app disclosure → permission flow.
- New Play Console accounts: 14-day closed test with 12+ testers before production.
- Apple: explain in App Review notes that drivers explicitly start/stop sharing
  per shift and that the fleet operator sees the position.
