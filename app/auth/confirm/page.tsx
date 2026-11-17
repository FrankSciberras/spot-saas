'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { rovoraFontVars } from '@/lib/rovoraFonts';
import { trackSignupError, trackSignupStep } from '@/lib/analytics/client';
import { PENDING_VERIFY_KEY } from '@/lib/analytics/signup-funnel';

/**
 * Where the "Verify my email" button in the sign-up code email lands.
 *
 * The token rides in the URL fragment (#token=…&type=…) — never sent to our
 * server, never in a Referer, never recorded by analytics — and is wiped from
 * the address bar as soon as it's read.
 *
 * It takes ONE tap to use it rather than verifying on load: mail scanners
 * (Outlook Safe Links and the like) open every link in an email, sometimes in
 * a real browser, and would otherwise burn the single-use token before the
 * person ever saw it.
 */
type Status = 'ready' | 'busy' | 'done' | 'already' | 'error';
const TYPES = new Set(['signup', 'magiclink']);
const NEXT = '/dashboard'; // routes a fleet-less account to onboarding (or its invites)

export default function ConfirmEmailPage() {
  const token = useRef<{ hash: string; type: 'signup' | 'magiclink' } | null>(null);
  const [status, setStatus] = useState<Status>('ready');
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Strict Mode runs effects twice; the first run already took the token and
    // cleared the address bar, so the second must not read it as missing.
    if (token.current) return;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const t = hash.get('token');
    const type = hash.get('type') ?? 'signup';
    // Off the address bar and out of history before anything else runs.
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    if (t && TYPES.has(type)) {
      token.current = { hash: t, type: type as 'signup' | 'magiclink' };
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL only works after mount
    setStatus('error');
    setMessage('This link is missing its details. Open the newest email from us, or sign in to get a fresh code.');
  }, []);

  const confirm = async () => {
    const t = token.current;
    if (!t || status === 'busy') return;
    setStatus('busy');
    const supabase = createClient();
    let { data, error } = await supabase.auth.verifyOtp({ token_hash: t.hash, type: t.type });
    // Some Supabase versions file a resent sign-up code under the generic type.
    if (error || !data.session) ({ data, error } = await supabase.auth.verifyOtp({ token_hash: t.hash, type: 'email' }));

    if (!error && data.session) {
      try {
        sessionStorage.removeItem(PENDING_VERIFY_KEY);
      } catch {
        /* nothing to forget */
      }
      trackSignupStep('Email verified', 'Email', { how: 'link', path: '/login' });
      setStatus('done');
      window.location.assign(NEXT);
      return;
    }

    // Already used — very often because they typed the code first. If that
    // left them signed in here, just carry on.
    const { data: who } = await supabase.auth.getUser();
    if (who.user?.email_confirmed_at) {
      setStatus('already');
      window.location.assign(NEXT);
      return;
    }
    trackSignupError(error?.message || 'link expired', 'Email');
    setStatus('error');
    setMessage(
      'This link has expired or was already used. Sign in with your email and password and we’ll send you a fresh one straight away.',
    );
  };

  const heading =
    status === 'error' ? 'This link didn’t work'
    : status === 'done' || status === 'already' ? 'You’re verified'
    : 'Verify your email';

  return (
    <div className={`rovora-site ${rovoraFontVars}`} data-theme="light">
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <span className="logo"><img src="/logo-full.png" alt="Rovora" /></span>
          </div>

          <div className="auth-head">
            <h1>{heading}</h1>
            <p>
              {status === 'error' ? message
                : status === 'done' || status === 'already' ? 'Taking you to set up your fleet…'
                : 'One tap and you’re in — this also signs you in on this device.'}
            </p>
          </div>

          {(status === 'ready' || status === 'busy') && (
            <button type="button" className="btn btn-primary btn-lg" onClick={confirm} disabled={status === 'busy'} autoFocus>
              {status === 'busy' ? 'Verifying…' : 'Confirm my email'}
            </button>
          )}
          {status === 'error' && (
            <a className="btn btn-primary btn-lg" href="/login">Sign in for a fresh link</a>
          )}
        </div>
      </div>
    </div>
  );
}
