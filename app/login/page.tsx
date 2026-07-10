'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  requestPasswordResetAction,
  requestSignupCodeAction,
  resendSignupCodeAction,
  type SignupVerifyType,
} from '@/lib/actions/auth-email';
import { rovoraFontVars } from '@/lib/rovoraFonts';
import RovoraThemeToggle from '@/components/marketing/RovoraThemeToggle';

type Mode = 'login' | 'forgot' | 'signup' | 'confirm';

function LoginPageContent() {
  const searchParams = useSearchParams();
  // Default to the dashboard resolver so signing in lands on the right dashboard,
  // not the marketing home page (which stays freely browsable while logged in).
  const redirectTo = searchParams.get('redirectTo') || '/dashboard';
  const initialMode: Mode = searchParams.get('mode') === 'signup' ? 'signup' : 'login';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [successMessage, setSuccessMessage] = useState('');
  // Email-confirmation code entry (signup verification).
  const [code, setCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  // Which verifyOtp type matches the code we sent ('signup' fresh / 'email' resent).
  const [verifyType, setVerifyType] = useState<SignupVerifyType>('signup');
  // Hide the "Back to home" escape hatch when running inside the Rovora Driver
  // app's WebView — there's no marketing site to go back to there.
  const [inApp, setInApp] = useState(false);

  useEffect(() => {
    if ((window as any).ReactNativeWebView) setInApp(true);
  }, []);

  // Ticks the "Resend code" cooldown down once per second.
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

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
            setResendCooldown(60);
          } else {
            setSuccessMessage('Your email isn’t verified yet. Use “Resend code” to get a fresh one.');
          }
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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      // Send the reset link via Resend (Supabase's mailer is bypassed — see
      // lib/actions/auth-email). Enumeration-safe: always reports success.
      const { ok, error: resetError } = await requestPasswordResetAction(email);

      if (!ok) {
        setError(resetError || 'Could not send the reset link. Please try again.');
        return;
      }

      setSuccessMessage('If an account exists for that email, a reset link is on its way. Check your inbox.');
      setEmail('');
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      // Creates the (unconfirmed) account server-side and emails a 6-digit code
      // via Resend — Supabase's own mailer is bypassed (see lib/actions/auth-email).
      const res = await requestSignupCodeAction(email, password);

      if (!res.ok) {
        setError(res.error || 'Could not create the account. Please try again.');
        return;
      }

      // Confirmation still disabled in Supabase — account is ready, sign in now.
      if (res.alreadyConfirmed) {
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
      setSuccessMessage(`We emailed a verification code to ${email}.`);
      setMode('confirm');
      setResendCooldown(60);
      return;
    } catch {
      setError('An unexpected error occurred. Please try again.');
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
        return;
      }

      // Verified AND signed in — straight into onboarding.
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
        return;
      }
      setVerifyType(res.verifyType ?? 'email');
      setSuccessMessage(`A fresh code is on its way to ${email}.`);
      setResendCooldown(60);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setError('');
    setSuccessMessage('');
    setCode('');
  };

  const heading =
    mode === 'login' ? 'Welcome back'
    : mode === 'signup' ? 'Start your free trial'
    : mode === 'confirm' ? 'Check your email'
    : 'Reset your password';
  const subheading =
    mode === 'login'
      ? 'Sign in to your Rovora fleet dashboard.'
      : mode === 'signup'
        ? 'Create your account and get your fleet on Rovora.'
        : mode === 'confirm'
          ? 'Enter the code we emailed you to verify your address.'
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

          {mode === 'signup' && (
            <form onSubmit={handleSignup}>
              <div className="field">
                <label htmlFor="signup-email">Email address</label>
                <input
                  id="signup-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourfleet.com"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="field">
                <label htmlFor="signup-password">Password</label>
                <input
                  id="signup-password"
                  type="password"
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
                <a role="button" tabIndex={0} onClick={() => switchMode('login')}>Sign in</a>
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
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className="auth-row">
                <span />
                <a role="button" tabIndex={0} onClick={() => switchMode('forgot')}>Forgot password?</a>
              </div>
              <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
              <p className="auth-foot">
                New here?{' '}
                <a role="button" tabIndex={0} onClick={() => switchMode('signup')}>Create a fleet account</a>
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
                  <span style={{ color: 'var(--text-3)' }}>Resend in {resendCooldown}s</span>
                ) : (
                  <a role="button" tabIndex={0} onClick={handleResendCode}>Resend code</a>
                )}
              </p>
              <p className="auth-foot">
                <a role="button" tabIndex={0} onClick={() => switchMode('login')}>← Back to sign in</a>
              </p>
            </form>
          )}

          {mode === 'forgot' && (
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
                <a role="button" tabIndex={0} onClick={() => switchMode('login')}>← Back to sign in</a>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
