import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Linking, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import {
  isTracking,
  lastSendError,
  lastSentAt,
  startTracking,
  stopTracking,
  type TrackingContext,
} from '../lib/locationTask';
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
  const [loading, setLoading] = useState(true);

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

  const requestPermissions = useCallback(async (): Promise<string | null> => {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      Alert.alert(
        'Location needed',
        'Rovora needs location access to share your position with your fleet. Enable it in Settings.',
        [{ text: 'Open Settings', onPress: () => Linking.openSettings() }, { text: 'Cancel' }]
      );
      return 'Location permission not granted.';
    }
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') {
      Alert.alert(
        'Background location needed',
        'To keep sharing while you use other apps, set location access to "Allow all the time" in Settings.',
        [{ text: 'Open Settings', onPress: () => Linking.openSettings() }, { text: 'Cancel' }]
      );
      return 'Background location not set to "Allow all the time".';
    }
    return null;
  }, []);

  const resolveContext = useCallback(async (): Promise<TrackingContext | string> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return 'Still connecting — try again in a few seconds.';
    const { data: driver } = await supabase
      .from('drivers')
      .select('id, organization_id')
      .eq('user_id', session.user.id)
      .single();
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

  const handleStart = useCallback(() => {
    // Prominent disclosure (required by Google Play / App Store for background location).
    Alert.alert(
      'Share your location?',
      'Rovora will collect your location, including in the background, to share your live position ' +
        'with your fleet operator while sharing is on. You can stop at any time.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => void sendStatus() },
        {
          text: 'Agree & start',
          onPress: async () => {
            try {
              const permissionError = await requestPermissions();
              if (permissionError) return void sendStatus(permissionError);
              const ctx = await resolveContext();
              if (typeof ctx === 'string') return void sendStatus(ctx);
              await startTracking(ctx);
              void sendStatus();
            } catch (e) {
              void sendStatus(e instanceof Error ? e.message : 'Failed to start tracking.');
            }
          },
        },
      ]
    );
  }, [requestPermissions, resolveContext, sendStatus]);

  const handleStop = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: driver } = await supabase
          .from('drivers')
          .select('id')
          .eq('user_id', session.user.id)
          .single();
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
        const msg = JSON.parse(event.nativeEvent.data) as Record<string, string>;
        switch (msg.type) {
          case 'session':
            if (msg.access_token && msg.refresh_token) {
              await supabase.auth.setSession({
                access_token: msg.access_token,
                refresh_token: msg.refresh_token,
              });
            }
            break;
          case 'signed-out':
            await handleStop();
            await supabase.auth.signOut();
            break;
          case 'start-tracking':
            handleStart();
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
