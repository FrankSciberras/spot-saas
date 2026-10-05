import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import LocationAccessModal, { type ModalReason } from '../components/LocationAccessModal';
import { checkLocationAccess, fixLocationAccess, problemMessage, type LocationProblem } from '../lib/locationAccess';
import appConfig from '../app.json';
import { supabase } from '../lib/supabase';
import {
  isTracking,
  lastSendError,
  lastSentAt,
  reportDeviceHealth,
  startTracking,
  stopTracking,
  storedContext,
  type TrackingContext,
} from '../lib/locationTask';
import { startMotionDetection } from '../lib/motionDetector';
import { colors } from '../lib/theme';

const PORTAL_URL = process.env.EXPO_PUBLIC_PORTAL_URL || 'https://rovora.eu/driver';
const REMIND_SNOOZE_MS = 5 * 60_000;

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
  // The location modal: a location-access problem (a start is then pending
  // until the driver fixes it — re-checked when they come back from Settings),
  // or 'sharing_off' (on shift, access is fine, but sharing isn't running).
  const [modalReason, setModalReason] = useState<ModalReason | null>(null);
  const modalReasonRef = useRef<ModalReason | null>(null);
  const [fixing, setFixing] = useState(false);
  const pendingStartRef = useRef(false);
  const fixingRef = useRef(false);
  const verifyingRef = useRef(false);
  const nagRunningRef = useRef(false);
  // "Not now" / a manual stop quiets the on-shift reminder for a few minutes.
  const snoozeUntilRef = useRef(0);
  // The fleet's "Live location during shifts" setting, sent by the portal with
  // the session. Off = no on-shift reminders (the portal also won't start
  // sharing at shift start). Defaults to on for older portal builds.
  const liveTrackingRef = useRef(true);
  // Sent with the status to the portal, which passes it to the fleet's Live
  // Map so they can see WHY a driver isn't sharing: the last location check's
  // result, and when the driver last tapped "Not now" (cleared once sharing).
  const lastAccessRef = useRef<{ access: LocationProblem | 'ok'; at: string } | null>(null);
  const promptDismissedAtRef = useRef<string | null>(null);
  // When sharing last restarted by itself after the phone had stopped it.
  const autoRestartedAtRef = useRef<string | null>(null);

  const showModal = useCallback((reason: ModalReason | null) => {
    modalReasonRef.current = reason;
    setModalReason(reason);
  }, []);

  const sendStatus = useCallback(async (extraError?: string) => {
    const status = {
      tracking: await isTracking(),
      lastSentAt: (await lastSentAt())?.toISOString() ?? null,
      error: extraError || (await lastSendError()),
      access: lastAccessRef.current?.access ?? null,
      accessCheckedAt: lastAccessRef.current?.at ?? null,
      promptDismissedAt: promptDismissedAtRef.current,
      autoRestartedAt: autoRestartedAtRef.current,
      appVersion: appConfig.expo.version,
      platform: Platform.OS,
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
    promptDismissedAtRef.current = null;
    if (modalReasonRef.current === 'sharing_off') showModal(null);
    void sendStatus();
  }, [resolveContext, sendStatus, showModal]);

  // Start sharing (going online sends this too). Verify location access first,
  // without prompting: all set → start straight away; anything missing → the
  // modal, which stays up until it's fixed or the driver taps "Not now".
  const handleStart = useCallback(async () => {
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    try {
      const problem = await checkLocationAccess();
      lastAccessRef.current = { access: problem ?? 'ok', at: new Date().toISOString() };
      if (problem) {
        pendingStartRef.current = true;
        showModal(problem);
        void sendStatus();
        return;
      }
      pendingStartRef.current = false;
      showModal(null);
      await beginTracking();
    } catch (e) {
      pendingStartRef.current = false;
      showModal(null);
      void sendStatus(e instanceof Error ? e.message : 'Failed to start tracking.');
    } finally {
      verifyingRef.current = false;
    }
  }, [beginTracking, sendStatus, showModal]);

  // On shift but not sharing → ask again: when the portal hands over the
  // session, whenever the app comes back to the foreground, and every minute
  // while it stays open (every few minutes after a "Not now").
  const remindIfOnShift = useCallback(async () => {
    if (AppState.currentState !== 'active' || !driverCtxRef.current || !liveTrackingRef.current) return;
    if (nagRunningRef.current || modalReasonRef.current || verifyingRef.current || fixingRef.current) return;
    if (Date.now() < snoozeUntilRef.current) return;
    nagRunningRef.current = true;
    try {
      if (await isTracking()) return;
      const ctx = await resolveContext();
      if (typeof ctx === 'string' || !ctx.shiftId) return;
      const problem = await checkLocationAccess();
      lastAccessRef.current = { access: problem ?? 'ok', at: new Date().toISOString() };
      // A start (or the modal) may have begun while we were checking.
      if (modalReasonRef.current || verifyingRef.current || fixingRef.current || (await isTracking())) return;
      // They were sharing THIS shift and the phone stopped it (only the driver's
      // own stop clears the saved context): restart straight away, no question.
      const saved = await storedContext();
      if (!problem && saved?.shiftId && saved.shiftId === ctx.shiftId) {
        await beginTracking();
        autoRestartedAtRef.current = new Date().toISOString();
        void sendStatus();
        return;
      }
      void sendStatus();
      pendingStartRef.current = problem !== null;
      showModal(problem ?? 'sharing_off');
    } catch {
      // best effort — the next foreground or tick tries again
    } finally {
      nagRunningRef.current = false;
    }
  }, [beginTracking, resolveContext, sendStatus, showModal]);

  const handleFix = useCallback(async () => {
    const reason = modalReasonRef.current;
    if (!reason || fixingRef.current) return;
    if (reason === 'sharing_off') return void handleStart();
    fixingRef.current = true;
    setFixing(true);
    try {
      await fixLocationAccess(reason);
    } catch {
      // the re-check below shows what's still missing
    } finally {
      fixingRef.current = false;
      setFixing(false);
    }
    if (pendingStartRef.current) await handleStart();
  }, [handleStart]);

  const handleNotNow = useCallback(() => {
    const reason = modalReasonRef.current;
    promptDismissedAtRef.current = new Date().toISOString();
    pendingStartRef.current = false;
    snoozeUntilRef.current = Date.now() + REMIND_SNOOZE_MS;
    showModal(null);
    if (!reason || reason === 'sharing_off') return void sendStatus();
    // Approximate location still tracks, just less precisely — better than nothing.
    if (reason === 'approximate') {
      beginTracking().catch((e) => void sendStatus(e instanceof Error ? e.message : 'Failed to start tracking.'));
      return;
    }
    void sendStatus(problemMessage(reason));
  }, [beginTracking, sendStatus, showModal]);

  // Back from Settings or a system prompt: re-check, and start if it's fixed
  // now. Otherwise remind an on-shift driver who isn't sharing — on every
  // return to the app and once a minute while it's open.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || fixingRef.current) return;
      if (pendingStartRef.current) void handleStart();
      else void remindIfOnShift();
    });
    const interval = setInterval(() => void remindIfOnShift(), 60_000);
    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, [handleStart, remindIfOnShift]);

  const handleStop = useCallback(async () => {
    pendingStartRef.current = false;
    snoozeUntilRef.current = Date.now() + REMIND_SNOOZE_MS;
    showModal(null);
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
  }, [sendStatus, showModal]);

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
            {
              const liveTracking = (msg as Record<string, unknown>).live_tracking;
              if (typeof liveTracking === 'boolean') liveTrackingRef.current = liveTracking;
              if (!liveTrackingRef.current && modalReasonRef.current === 'sharing_off') showModal(null);
            }
            void remindIfOnShift();
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
          case 'check-access': {
            // The portal's go-online page asks before starting a shift when the
            // fleet requires location (answers on the 'rovora-native-access' event).
            const problem = await checkLocationAccess();
            lastAccessRef.current = { access: problem ?? 'ok', at: new Date().toISOString() };
            const reply = JSON.stringify({ requestId: msg.requestId ?? null, problem });
            webViewRef.current?.injectJavaScript(
              `window.dispatchEvent(new CustomEvent('rovora-native-access', { detail: ${JSON.stringify(reply)} })); true;`
            );
            break;
          }
        }
      } catch {
        // ignore malformed messages
      }
    },
    [handleStart, handleStop, remindIfOnShift, sendStatus, showModal]
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
        reason={modalReason}
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
