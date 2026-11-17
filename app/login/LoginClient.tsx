'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  requestPasswordResetAction,
  requestSignupCodeAction,
  resendSignupCodeAction,
  type SignupVerifyType,
} from '@/lib/actions/auth-email';
import { RESET_RESEND_COOLDOWN, SIGNUP_RESEND_COOLDOWN } from '@/lib/auth/email-limits';
import { rovoraFontVars } from '@/lib/rovoraFonts';
import { safeInternalPath } from '@/lib/utils/safeRedirect';
import RovoraThemeToggle from '@/components/marketing/RovoraThemeToggle';
import PasswordInput from '@/components/shared/PasswordInput';
import GoogleSignInButton from '@/components/shared/GoogleSignInButton';
import SignupAside from './SignupAside';
import type { TrialCopy } from '@/lib/billing/trial-offer';
import type { Testimonial } from '@/components/marketing/testimonials';

/** Loaded on the server (page.tsx): what a sign-up gets right now, and proof. */
export interface SignupExtras {
  trial: TrialCopy;
  testimonial: Testimonial | null;
}
import { trackEvent, trackSignupError, trackSignupStep } from '@/lib/analytics/client';
import { PENDING_VERIFY_KEY, PENDING_VERIFY_MAX_AGE_MS } from '@/lib/analytics/signup-funnel';

type Mode = 'login' | 'forgot' | 'signup' | 'confirm';

/**
 * Seconds left until a deadline, re-rendering once a second. Counts against the
 * clock rather than decrementing, because phones pause timers while the user is
 * off in their email app — a tick counter would come back still showing 1:45.
 */
function useCountdown(): [number, (seconds: number) => void] {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!until) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= until) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [until]);

  const start = useCallback((seconds: number) => {
    const t = Date.now();
    setNow(t);
    setUntil(seconds > 0 ? t + seconds * 1000 : 0);
  }, []);

  return [until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0, start];
}

/** 95 → "1:35", 42 → "42s". */
function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Remember which address is waiting for its code, so a reload can restore the code screen. */
function rememberPendingVerify(email: string, verifyType: SignupVerifyType) {
  try {
    sessionStorage.setItem(PENDING_VERIFY_KEY, JSON.stringify({ email, verifyType, at: Date.now() }));
  } catch {
    /* private mode / storage blocked — the screen just won't survive a reload */
  }
}

function forgetPendingVerify() {
  try {
    sessionStorage.removeItem(PENDING_VERIFY_KEY);
  } catch {
    /* nothing to forget */
  }
}

function readPendingVerify(): { email: string; verifyType: SignupVerifyType } | null {
  try {
    const raw = sessionStorage.getItem(PENDING_VERIFY_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { email?: unknown; verifyType?: unknown; at?: unknown };
    if (typeof v.email !== 'string' || !v.email || typeof v.at !== 'number') return null;
    if (Date.now() - v.at > PENDING_VERIFY_MAX_AGE_MS) {
      forgetPendingVerify();
      return null;
    }
    return { email: v.email, verifyType: v.verifyType === 'email' ? 'email' : 'signup' };
  } catch {
    return null;
  }
}

function LoginPageContent({ trial, testimonial }: SignupExtras) {
  const searchParams = useSearchParams();
  // Default to the dashboard resolver so signing in lands on the right dashboard,
  // not the marketing home page (which stays freely browsable while logged in).
  // Only same-origin paths are honoured — a crafted ?redirectTo=https://evil…
  // must not bounce a freshly signed-in user off the site.
  const redirectTo = safeInternalPath(searchParams.get('redirectTo'), '/dashboard');
  const initialMode: Mode = searchParams.get('mode') === 'signup' ? 'signup' : 'login';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [successMessage, setSuccessMessage] = useState('');
  // Email-confirmation code entry (signup verification).
  const [code, setCode] = useState('');
  const [resendCooldown, startResendCooldown] = useCountdown();
  // Which verifyOtp type matches the code we sent ('signup' fresh / 'email' resent).
  const [verifyType, setVerifyType] = useState<SignupVerifyType>('signup');
  // Forgot password: the address we last sent a link to (switches the card to
  // the "Check your inbox" view with its Resend button) + that button's cooldown.
  const [resetSentTo, setResetSentTo] = useState('');
  const [resetCooldown, startResetCooldown] = useCountdown();
  // Hide the "Back to home" escape hatch when running inside the Rovora Driver
  // app's WebView — there's no marketing site to go back to there.
  const [inApp, setInApp] = useState(false);

  useEffect(() => {
    if ((window as any).ReactNativeWebView) setInApp(true);
  }, []);

  // Came back to a reloaded tab mid-verification (phones drop the page while
  // you're in your email app): put the code screen back instead of an empty form.
  useEffect(() => {
    const pending = readPendingVerify();
    if (!pending) return;
    // sessionStorage only exists in the browser, so this can't be initial state:
    // restoring once, right after mount, is the whole point of the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEmail(pending.email);
    setVerifyType(pending.verifyType);
    setSuccessMessage(`Enter the code we emailed to ${pending.email}.`);
    setMode('confirm');
  }, []);

  // Tapped the emailed link instead (another tab, or the mail app's browser
  // then back here)? The session cookie is shared, so move on when they return.
  useEffect(() => {
    if (mode !== 'confirm') return;
    let moving = false;
    const check = async () => {
      if (moving || document.visibilityState !== 'visible') return;
      const { data } = await createClient().auth.getSession();
      if (!data.session || moving) return;
      moving = true;
      forgetPendingVerify();
      window.location.assign('/dashboard');
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [mode]);

  // Sign-up funnel (Admin → Analytics): the form was seen, and someone began it.
  const formViewed = useRef(false);
  const formStarted = useRef(false);
  useEffect(() => {
    if (mode !== 'signup' || formViewed.current) return;
    // A reload that is about to restore the code screen isn't a fresh look at the form.
    if (readPendingVerify()) return;
    formViewed.current = true;
    trackSignupStep('Form viewed');
  }, [mode]);
  const markFormStarted = (via: 'Email' | 'Google') => {
    if (formStarted.current) return;
    formStarted.current = true;
    trackSignupStep('Form started', via);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        // Unconfirmed account — send a fresh code and route to the code screen.
        if (/email not confirmed/i.test(signInError.message)) {
          setError('');
          const res = await resendSignupCodeAction(email);
          if (res.ok) {
            setVerifyType(res.verifyType ?? 'email');
            setSuccessMessage(`Your email isn’t verified yet. We’ve sent a fresh code to ${email}.`);
            startResendCooldown(SIGNUP_RESEND_COOLDOWN);
          } else {
            setSuccessMessage('Your email isn’t verified yet. Use “Resend code” to get a fresh one.');
            if (res.retryAfter) startResendCooldown(res.retryAfter);
          }
          rememberPendingVerify(email.trim().toLowerCase(), res.verifyType ?? 'email');
          setMode('confirm');
          return;
        }
        setError(signInError.message);
        return;
      }

      // Hard navigation so the server re-runs with the new session cookie
      // and routes to the correct dashboard (avoids the cached public page).
      window.location.assign(redirectTo);
      return;
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Sends (or re-sends) the reset link via Resend — Supabase's mailer is
  // bypassed, see lib/actions/auth-email. Enumeration-safe: real and unknown
  // addresses get the same answer, including the same rate limits.
  const sendResetLink = async (address: string, isResend: boolean) => {
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      const res = await requestPasswordResetAction(address);

      // Rate-limited (a recent send, or too many this hour). Show the inbox view
      // with the countdown so they know when they can try again.
      if (res.retryAfter) {
        setResetSentTo(address);
        startResetCooldown(res.retryAfter);
        setError(res.error || 'Please wait a moment before requesting another link.');
        return;
      }

      if (!res.ok) {
        setError(res.error || 'Could not send the reset link. Please try again.');
        return;
      }

      setResetSentTo(address);
      startResetCooldown(RESET_RESEND_COOLDOWN);
      // Supabase keeps one live reset token per account, so the new email
      // replaces the old one — say so, or people click the stale link first.
      if (isResend) setSuccessMessage('We’ve sent a new link. Use the newest email — older links no longer work.');
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    sendResetLink(email.trim(), false);
  };

  const handleResendReset = () => {
    if (resetCooldown > 0 || loading || !resetSentTo) return;
    sendResetLink(resetSentTo, true);
  };

  // Back to the empty form. The cooldown belonged to the old address — the
  // server still enforces its own limits on whatever they type next.
  const changeResetEmail = () => {
    setResetSentTo('');
    startResetCooldown(0);
    setEmail('');
    setError('');
    setSuccessMessage('');
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);
    markFormStarted('Email');
    trackEvent('Signup started', { label: 'Email' });

    try {
      // Creates the (unconfirmed) account server-side and emails a 6-digit code
      // via Resend — Supabase's own mailer is bypassed (see lib/actions/auth-email).
      const res = await requestSignupCodeAction(email, password);

      if (!res.ok) {
        setError(res.error || 'Could not create the account. Please try again.');
        trackSignupError(res.error, 'Email');
        return;
      }

      // Confirmation still disabled in Supabase — account is ready, sign in now.
      if (res.alreadyConfirmed) {
        trackSignupStep('Email verified', 'Email');
        const supabase = createClient();
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setSuccessMessage('Account created! Sign in to continue.');
          setMode('login');
          return;
        }
        window.location.assign('/onboarding');
        return;
      }

      setVerifyType(res.verifyType ?? 'signup');
      setSuccessMessage(`We emailed ${email} a link and a code — tap the link, or type the code here.`);
      setMode('confirm');
      startResendCooldown(SIGNUP_RESEND_COOLDOWN);
      rememberPendingVerify(email.trim().toLowerCase(), res.verifyType ?? 'signup');
      trackSignupStep('Code sent', 'Email');
      return;
    } catch {
      setError('An unexpected error occurred. Please try again.');
      trackSignupError(null, 'Email');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createClient();
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: verifyType,
      });

      if (verifyError || !data.session) {
        setError(
          /expired|invalid/i.test(verifyError?.message || '')
            ? 'That code is invalid or has expired. Check the digits or resend a fresh code.'
            : verifyError?.message || 'Could not verify the code. Please try again.'
        );
        // Nearly always a mistyped or stale code; anything else lands in "Other".
        trackSignupError(verifyError?.message || 'code is invalid', 'Email');
        return;
      }

      // Verified AND signed in — straight into onboarding.
      forgetPendingVerify();
      trackSignupStep('Email verified', 'Email', { how: 'code' });
      window.location.assign('/onboarding');
      return;
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || !email) return;
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      // Server-side resend through Resend (never Supabase SMTP).
      const res = await resendSignupCodeAction(email);
      if (!res.ok) {
        setError(res.error || 'Could not send a new code. Please try again.');
        trackSignupError(res.error, 'Email');
        if (res.retryAfter) startResendCooldown(res.retryAfter);
        return;
      }
      setVerifyType(res.verifyType ?? 'email');
      setSuccessMessage(`A fresh code is on its way to ${email}.`);
      startResendCooldown(SIGNUP_RESEND_COOLDOWN);
      rememberPendingVerify(email.trim().toLowerCase(), res.verifyType ?? 'email');
      trackSignupStep('Code resent', 'Email');
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: Mode) => {
    // Leaving the code screen on purpose — don't drag them back to it on reload.
    if (mode === 'confirm') forgetPendingVerify();
    setMode(newMode);
    setError('');
    setSuccessMessage('');
    setCode('');
  };

  const heading =
    mode === 'login' ? 'Welcome back'
    : mode === 'signup' ? 'Get started free'
    : mode === 'confirm' ? 'Check your email'
    : resetSentTo ? 'Check your inbox'
    : 'Reset your password';
  const subheading =
    mode === 'login'
      ? 'Sign in to your Rovora fleet dashboard.'
      : mode === 'signup'
        ? `${trial.freeLabel}, every feature included. No card, cancel any time.`
        : mode === 'confirm'
          ? 'Tap the link in the email we sent you, or enter the code below.'
          : resetSentTo
            ? `If an account exists for ${resetSentTo}, we’ve emailed it a link to set a new password.`
            : 'We’ll email you a link to set a new password.';

  return (
    <div className={`rovora-site ${rovoraFontVars}`} data-theme="light">
      {!inApp && (
        <Link className="auth-back" href="/">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to home
        </Link>
      )}
      <div className="auth-toggle">
        <RovoraThemeToggle />
      </div>

      <div className="auth-wrap">
        <div className={mode === 'signup' ? 'auth-split' : undefined}>
        <div className="auth-card">
          <div className="auth-logo">
            <span className="logo"><img src="/logo-full.png" alt="Rovora" /></span>
          </div>

          <div className="auth-head">
            <h1>{heading}</h1>
            <p>{subheading}</p>
          </div>

          {error && <div className="auth-alert err">{error}</div>}
          {successMessage && <div className="auth-alert ok">{successMessage}</div>}

          {(mode === 'login' || mode === 'signup') && (
            // Same component on both screens; `key` gives each its own button
            // wording and a fresh nonce when switching between them.
            <GoogleSignInButton
              key={mode}
              intent={mode === 'signup' ? 'signup' : 'signin'}
              // New Google accounts have no fleet yet — /dashboard sends them on
              // to onboarding, existing ones to the right dashboard.
              redirectTo={mode === 'signup' ? '/dashboard' : redirectTo}
              onStart={() => {
                setError('');
                setSuccessMessage('');
                if (mode === 'signup') {
                  markFormStarted('Google');
                  trackEvent('Signup started', { label: 'Google' });
                }
              }}
              onSuccess={() => {
                if (mode === 'signup') trackSignupStep('Email verified', 'Google');
              }}
              onError={(message) => {
                setError(message);
                if (mode === 'signup') trackSignupError(message, 'Google');
              }}
            />
          )}

          {mode === 'signup' && (
            <form onSubmit={handleSignup}>
              <div className="field">
                <label htmlFor="signup-email">Email address</label>
                <input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    markFormStarted('Email');
                  }}
                  placeholder="you@yourfleet.com"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="field">
                <label htmlFor="signup-password">Password</label>
                <PasswordInput
                  id="signup-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Choose a password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
              <button type="submit" className="btn btn-primary btn-lg" disabled={loading || !email || !password}>
                {loading ? 'Creating account…' : 'Create account'}
              </button>
              <p className="auth-foot">
                Already have an account?{' '}
                <button type="button" className="auth-link" onClick={() => switchMode('login')}>Sign in</button>
              </p>
            </form>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin}>
              <div className="field">
                <label htmlFor="email">Email address</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourfleet.com"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="field">
                <label htmlFor="password">Password</label>
                <PasswordInput
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className="auth-row">
                <span />
                <button type="button" className="auth-link" onClick={() => switchMode('forgot')}>Forgot password?</button>
              </div>
              <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
              <p className="auth-foot">
                New here?{' '}
                <button type="button" className="auth-link" onClick={() => switchMode('signup')}>Create a fleet account</button>
              </p>
            </form>
          )}

          {mode === 'confirm' && (
            <form onSubmit={handleVerifyCode}>
              <div className="field">
                <label htmlFor="confirm-code">Verification code</label>
                <input
                  id="confirm-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={10}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter the code"
                  required
                  autoFocus
                  style={{ textAlign: 'center', letterSpacing: '0.3em', fontSize: 20, fontWeight: 600 }}
                />
              </div>
              <button type="submit" className="btn btn-primary btn-lg" disabled={loading || code.length < 6}>
                {loading ? 'Verifying…' : 'Verify & continue'}
              </button>
              <p className="auth-foot">
                Didn’t get it?{' '}
                {resendCooldown > 0 ? (
                  <span style={{ color: 'var(--text-3)' }}>Resend in {formatWait(resendCooldown)}</span>
                ) : (
                  <button type="button" className="auth-link" onClick={handleResendCode}>Resend code</button>
                )}
              </p>
              <p className="auth-foot">
                <button type="button" className="auth-link" onClick={() => switchMode('login')}>← Back to sign in</button>
              </p>
            </form>
          )}

          {mode === 'forgot' && resetSentTo && (
            <div>
              <p className="auth-note">
                The link expires in 1 hour. Can’t find it? Give it a minute, then check your spam or junk folder.
              </p>
              <button
                type="button"
                className="btn btn-ghost btn-lg tabular"
                onClick={handleResendReset}
                disabled={loading || resetCooldown > 0}
              >
                {loading ? 'Sending…'
                  : resetCooldown > 0 ? `Resend link in ${formatWait(resetCooldown)}`
                  : 'Resend reset link'}
              </button>
              <p className="auth-foot">
                Wrong address?{' '}
                <button type="button" className="auth-link" onClick={changeResetEmail}>Use a different email</button>
              </p>
              <p className="auth-foot">
                <button type="button" className="auth-link" onClick={() => switchMode('login')}>← Back to sign in</button>
              </p>
            </div>
          )}

          {mode === 'forgot' && !resetSentTo && (
            <form onSubmit={handleForgotPassword}>
              <div className="field">
                <label htmlFor="reset-email">Email address</label>
                <input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourfleet.com"
                  required
                  autoComplete="email"
                />
              </div>
              <button type="submit" className="btn btn-primary btn-lg" disabled={loading || !email}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
              <p className="auth-foot">
                <button type="button" className="auth-link" onClick={() => switchMode('login')}>← Back to sign in</button>
              </p>
            </form>
          )}
        </div>
        {mode === 'signup' && <SignupAside trial={trial} testimonial={testimonial} />}
        </div>
      </div>
    </div>
  );
}

export default function LoginClient(props: SignupExtras) {
  return (
    <Suspense fallback={null}>
      <LoginPageContent {...props} />
    </Suspense>
  );
}
