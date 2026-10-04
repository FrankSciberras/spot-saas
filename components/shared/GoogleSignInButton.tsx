'use client';

// =============================================================================
// GOOGLE SIGN-IN BUTTON — "Sign in / Sign up with Google" on the login page
// =============================================================================
// Google's own button (Google Identity Services). The ID token it returns is
// handed to Supabase with signInWithIdToken, which verifies it, then creates
// the account — or links Google to an existing one with the same email — and
// starts the session.
//
// Why this rather than Supabase's redirect flow (signInWithOAuth): Google's
// popup then names rovora.eu. The redirect flow names our raw
// <project>.supabase.co address, which reads like a phishing page unless we
// paid for a Supabase custom domain.
//
// Security: a fresh random nonce per mount. Google signs its SHA-256 into the
// ID token and Supabase recomputes it from the raw value we send, so a token
// lifted from somewhere else can't be replayed into a session here.
//
// Renders nothing (not even the "or" divider) when NEXT_PUBLIC_GOOGLE_CLIENT_ID
// is unset, inside the driver app's WebView (Google refuses sign-in from
// embedded browsers), or if Google's script can't load — the email form then
// stands on its own exactly as before.
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || '';
const GSI_SRC = 'https://accounts.google.com/gsi/client';

// Just the slice of the Google Identity Services API we use.
interface GsiApi {
  initialize(config: {
    client_id: string;
    callback: (res: { credential?: string }) => void;
    nonce: string;
    ux_mode: 'popup';
    context: 'signin' | 'signup';
    auto_select: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type: 'standard';
      theme: 'outline' | 'filled_black';
      size: 'large';
      text: 'signin_with' | 'signup_with';
      shape: 'rectangular';
      logo_alignment: 'center';
      width: number;
    }
  ): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GsiApi } };
  }
}

let gsiLoading: Promise<GsiApi> | null = null;

/** Loads Google's script once per page, however many times the button mounts. */
function loadGsi(): Promise<GsiApi> {
  const ready = window.google?.accounts?.id;
  if (ready) return Promise.resolve(ready);
  gsiLoading ??= new Promise<GsiApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => {
      const api = window.google?.accounts?.id;
      if (api) resolve(api);
      else reject(new Error('Google sign-in script loaded without its API'));
    };
    script.onerror = () => reject(new Error('Google sign-in script failed to load'));
    document.head.appendChild(script);
  }).catch((err) => {
    gsiLoading = null; // let a later mount retry
    throw err;
  });
  return gsiLoading;
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** Random nonce + its SHA-256: Google gets the hash, Supabase the raw value. */
async function makeNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return { raw, hashed: toHex(new Uint8Array(digest)) };
}

/** Supabase's error text → something a fleet owner can act on. */
function friendlyError(message: string): string {
  if (/not enabled|unsupported provider|audience/i.test(message)) {
    return 'Google sign-in isn’t switched on yet. Please use your email and password for now.';
  }
  if (/nonce/i.test(message)) return 'That Google sign-in timed out. Please try again.';
  if (/signups? not allowed/i.test(message)) return 'New sign-ups are closed at the moment.';
  return 'Google sign-in didn’t work. Please try again, or use your email and password.';
}

interface Props {
  /** Button wording: "Sign in with Google" or "Sign up with Google". */
  intent: 'signin' | 'signup';
  /** Where to go once signed in — must already be a safe internal path. */
  redirectTo: string;
  /** Google handed us a token — clear stale errors/messages. */
  onStart?: () => void;
  /** Sign-in failed; show this to the user. */
  onError: (message: string) => void;
}

export default function GoogleSignInButton({ intent, redirectTo, onStart, onError }: Props) {
  const slot = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'busy' | 'unavailable'>(
    CLIENT_ID ? 'loading' : 'unavailable'
  );

  // Google keeps the callback from the last initialize(); read props through a
  // ref so it never acts on stale ones.
  const latest = useRef({ redirectTo, onStart, onError });
  useEffect(() => {
    latest.current = { redirectTo, onStart, onError };
  });

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | undefined;

    const signIn = async (credential: string | undefined, rawNonce: string) => {
      const { onStart: start, onError: fail } = latest.current;
      if (!credential) {
        fail('Google didn’t send back a sign-in. Please try again.');
        return;
      }
      start?.();
      setStatus('busy');
      const { error } = await createClient().auth.signInWithIdToken({
        provider: 'google',
        token: credential,
        nonce: rawNonce,
      });
      if (error) {
        console.error('Google sign-in failed:', error);
        setStatus('ready');
        fail(friendlyError(error.message));
        return;
      }
      // Hard navigation so the server sees the new session cookie. New accounts
      // have no fleet yet, and /dashboard routes those to onboarding.
      window.location.assign(latest.current.redirectTo);
    };

    (async () => {
      try {
        // Google blocks sign-in inside embedded app browsers (the driver app).
        if ((window as { ReactNativeWebView?: unknown }).ReactNativeWebView) throw new Error('in-app WebView');
        // The nonce hash needs Web Crypto, which only exists over https/localhost.
        if (!window.isSecureContext || !crypto?.subtle) throw new Error('insecure context');

        const [gsi, nonce] = await Promise.all([loadGsi(), makeNonce()]);
        const el = slot.current;
        if (cancelled || !el) return;

        gsi.initialize({
          client_id: CLIENT_ID,
          callback: (res) => void signIn(res.credential, nonce.raw),
          nonce: nonce.hashed,
          ux_mode: 'popup',
          context: intent,
          auto_select: false,
        });
        // Google's button takes a fixed pixel width (200–400), so draw it to fill
        // the card and redraw if the card resizes (phone rotation, window drag).
        let drawnWidth = 0;
        const draw = () => {
          const width = Math.round(Math.min(400, Math.max(200, el.clientWidth)));
          if (Math.abs(width - drawnWidth) < 4) return;
          drawnWidth = width;
          el.replaceChildren();
          gsi.renderButton(el, {
            type: 'standard',
            theme: el.closest('[data-theme="dark"]') ? 'filled_black' : 'outline',
            size: 'large',
            text: intent === 'signup' ? 'signup_with' : 'signin_with',
            shape: 'rectangular',
            logo_alignment: 'center',
            width,
          });
        };
        draw();
        resizeObserver = new ResizeObserver(draw);
        resizeObserver.observe(el);
        setStatus('ready');
      } catch (err) {
        console.warn('Google sign-in unavailable:', err);
        if (!cancelled) setStatus('unavailable');
      }
    })();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
    };
  }, [intent]);

  if (status === 'unavailable') return null;

  return (
    <div className="auth-google" aria-busy={status !== 'ready'}>
      <div ref={slot} className="auth-google-slot" hidden={status === 'busy'} />
      {status === 'busy' && <p className="auth-google-busy">Signing you in with Google…</p>}
      <div className="auth-divider" role="separator">
        <span>or use your email</span>
      </div>
    </div>
  );
}
