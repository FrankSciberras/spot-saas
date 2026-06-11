'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * When the driver portal runs inside the Rovora Driver app's WebView, hand the
 * Supabase session to the native shell so background location tracking is
 * authenticated as the same user. No-op in a normal browser.
 */
export default function NativeBridge() {
  useEffect(() => {
    const native = (window as any).ReactNativeWebView;
    if (!native) return;
    const supabase = createClient();

    const post = (session: { access_token: string; refresh_token: string } | null) => {
      if (session?.access_token && session?.refresh_token) {
        native.postMessage(
          JSON.stringify({
            type: 'session',
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          })
        );
      }
    };

    supabase.auth.getSession().then(({ data }) => post(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        native.postMessage(JSON.stringify({ type: 'signed-out' }));
      } else {
        post(session);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return null;
}
