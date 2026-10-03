import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import LocationAccessModal from '../components/LocationAccessModal';
import {
  checkLocationAccess,
  fixLocationAccess,
  problemMessage,
  type LocationProblem,
} from '../lib/locationAccess';
import { supabase } from '../lib/supabase';
import {
  isTracking,
  lastSendError,
  lastSentAt,
  reportDeviceHealth,
  startTracking,
  stopTracking,
  type TrackingContext,
} from '../lib/locationTask';
import { startMotionDetection } from '../lib/motionDetector';
import { colors } from '../lib/theme';

const PORTAL_URL = process.env.EXPO_PUBLIC_PORTAL_URL || 'https://rovora.eu/driver';

/**
 * The whole driver experience is the Rovora web portal in a WebView.
 * This native shell only adds what the web can't do:
 *  - background location tracking (commanded by the web page via postMessage)
 *  - the web page hands its Supabase session to the native client so tracking
 *    writes are authenticated with the same login (no second sign-in).
 */
export default function PortalScreen() {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const canGoBackRef = useRef(false);
  // Which driver row is active, as told by the web portal with the session. A
  // driver who works for two fleets has two driver rows; a bare user_id lookup
  // can't tell them apart (and .single() errors on two rows).
  const driverCtxRef = useRef<{ driverId: string; organizationId: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  // Location access isn't set up for tracking: the modal is up and a start is
  // waiting on the driver fixing it (re-checked when they come back from Settings).
  const [accessProblem, setAccessProblem] = useState<LocationProblem | null>(null);
  const [fixing, setFixing] = useState(false);
  const pendingStartRef = useRef(false);
  const fixingRef = useRef(false);
  const verifyingRef = useRef(false);

  const sendStatus = useCallback(async (extraError?: string) => {
    const status = {
      tracking: await isTracking(),
      lastSentAt: (await lastSentAt())?.toISOString() ?? null,
      error: extraError || (await lastSendError()),
    };
    // Double-stringify: the web side receives a JSON string in event.detail.
    webViewRef.current?.injectJavaScript(
      `window.dispatchEvent(new CustomEvent('rovora-native', { detail: ${JSON.stringify(JSON.stringify(status))} })); true;`
    );
  }, []);

  // While tracking, keep the web UI's "last update" fresh.
  useEffect(() => {
    const interval = setInterval(async () => {
      if (await isTracking()) void sendStatus();
    }, 5_000);
    return () => clearInterval(interval);
  }, [sendStatus]);

  // Device health: re-check GPS/permission whenever the app comes back to the
  // foreground, and once a minute while tracking. Also (re)start harsh-driving
  // detection — it doesn't survive an app restart on its own.
  useEffect(() => {
    const check = async () => {
      if (await isTracking()) {
        void reportDeviceHealth();
        void startMotionDetection();
      }
    };
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    const interval = setInterval(() => void check(), 60_000);
    void check();
    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, []);

  // Android hardware/gesture back navigates the portal history first.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBackRef.current) {
        webViewRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  const resolveContext = useCallback(async (): Promise<TrackingContext | string> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return 'Still connecting — try again in a few seconds.';
    // Prefer the active fleet's driver row (sent by the portal); fall back to
    // the first row for this login so a legacy portal build still works.
    const known = driverCtxRef.current;
    const driverQuery = supabase.from('drivers').select('id, organization_id');
    const { data: driver } = known
      ? await driverQuery.eq('id', known.driverId).maybeSingle()
      : await driverQuery.eq('user_id', session.user.id).limit(1).maybeSingle();
    if (!driver) return 'No driver profile found for this account.';
    const { data: shift } = await supabase
      .from('driver_shifts')
      .select('id')
      .eq('driver_id', driver.id)
      .is('end_time', null)
      .order('start_time', { ascending: false })
      .limit(1)
      .maybeSingle();
    return { driverId: driver.id, organizationId: driver.organization_id, shiftId: shift?.id ?? null };
  }, []);

  const beginTracking = useCallback(async () => {
    const ctx = await resolveContext();
    if (typeof ctx === 'string') return void sendStatus(ctx);
    await startTracking(ctx);
    void sendStatus();
  }, [resolveContext, sendStatus]);

  // Start sharing (going online sends this too). Verify location access first,
  // without prompting: all set → start straight away; anything missing → the
  // modal, which stays up until it's fixed or the driver taps "Not now".
  const handleStart = useCallback(async () => {
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    try {
      const problem = await checkLocationAccess();
      if (problem) {
        pendingStartRef.current = true;
        setAccessProblem(problem);
        return;
      }
      pendingStartRef.current = false;
      setAccessProblem(null);
      await beginTracking();
    } catch (e) {
      pendingStartRef.current = false;
      setAccessProblem(null);
      void sendStatus(e instanceof Error ? e.message : 'Failed to start tracking.');
    } finally {
      verifyingRef.current = false;
    }
  }, [beginTracking, sendStatus]);

  const handleFix = useCallback(async () => {
    if (!accessProblem || fixingRef.current) return;
    fixingRef.current = true;
    setFixing(true);
    try {
      await fixLocationAccess(accessProblem);
    } catch {
      // the re-check below shows what's still missing
    } finally {
      fixingRef.current = false;
      setFixing(false);
    }
    if (pendingStartRef.current) await handleStart();
  }, [accessProblem, handleStart]);

  const handleNotNow = useCallback(() => {
    const problem = accessProblem;
    pendingStartRef.current = false;
    setAccessProblem(null);
    if (!problem) return;
    // Approximate location still tracks, just less precisely — better than nothing.
    if (problem === 'approximate') {
      beginTracking().catch((e) => void sendStatus(e instanceof Error ? e.message : 'Failed to start tracking.'));
      return;
    }
    void sendStatus(problemMessage(problem));
  }, [accessProblem, beginTracking, sendStatus]);

  // Back from Settings or a system prompt: re-check, and start if it's fixed now.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && pendingStartRef.current && !fixingRef.current) void handleStart();
    });
    return () => sub.remove();
  }, [handleStart]);

  const handleStop = useCallback(async () => {
    pendingStartRef.current = false;
    setAccessProblem(null);
    try {
      const known = driverCtxRef.current;
      if (known) {
        await stopTracking(known.driverId);
        return void sendStatus();
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: driver } = await supabase
          .from('drivers')
          .select('id')
          .eq('user_id', session.user.id)
          .limit(1)
          .maybeSingle();
        if (driver) {
          await stopTracking(driver.id);
          return void sendStatus();
        }
      }
      // No session/driver — still stop the local task.
      await stopTracking('');
      void sendStatus();
    } catch (e) {
      void sendStatus(e instanceof Error ? e.message : 'Failed to stop tracking.');
    }
  }, [sendStatus]);

  const onMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      try {
        // Only the Rovora portal may drive the shell. Any other page that ends up
        // in the WebView (a link the driver tapped) could otherwise post a
        // 'session' and redirect GPS uploads to someone else's account.
        const portalOrigin = new URL(PORTAL_URL).origin;
        let senderOrigin = '';
        try {
          senderOrigin = new URL(event.nativeEvent.url).origin;
        } catch {
          return;
        }
        if (senderOrigin !== portalOrigin) return;

        const msg = JSON.parse(event.nativeEvent.data) as Record<string, string | null>;
        switch (msg.type) {
          case 'session':
            if (msg.access_token && msg.refresh_token) {
              await supabase.auth.setSession({
                access_token: msg.access_token,
                refresh_token: msg.refresh_token,
              });
            }
            // Remember which driver row the portal says is active (see driverCtxRef).
            if (msg.driver_id) {
              driverCtxRef.current = {
                driverId: msg.driver_id,
                organizationId: msg.organization_id ?? null,
              };
            }
            break;
          case 'signed-out':
            await handleStop();
            await supabase.auth.signOut();
            break;
          case 'start-tracking':
            void handleStart();
            break;
          case 'stop-tracking':
            void handleStop();
            break;
          case 'get-status':
            void sendStatus();
            break;
        }
      } catch {
        // ignore malformed messages
      }
    },
    [handleStart, handleStop, sendStatus]
  );

  return (
    <View style={[styles.page, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <WebView
        ref={webViewRef}
        source={{ uri: PORTAL_URL }}
        style={styles.web}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(nav) => {
          canGoBackRef.current = nav.canGoBack;
        }}
        onMessage={onMessage}
        applicationNameForUserAgent="RovoraDriverApp/1.0"
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
      />
      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      )}
      <LocationAccessModal
        problem={accessProblem}
        fixing={fixing}
        onFix={() => void handleFix()}
        onDismiss={handleNotNow}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  web: { flex: 1, backgroundColor: colors.bg },
  loader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
});
