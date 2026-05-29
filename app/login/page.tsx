'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { spotFontVars } from '@/lib/spotFonts';
import SpotThemeToggle from '@/components/marketing/SpotThemeToggle';

type Mode = 'login' | 'forgot' | 'signup';

function LoginPageContent() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/';
  const initialMode: Mode = searchParams.get('mode') === 'signup' ? 'signup' : 'login';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [successMessage, setSuccessMessage] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
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
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
      });

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setSuccessMessage('Password reset link sent! Check your email inbox.');
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
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (!data.session) {
        setSuccessMessage('Account created! Check your email to confirm, then sign in.');
        setMode('login');
        return;
      }

      window.location.assign('/onboarding');
      return;
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
  };

  const heading =
    mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Start your free trial' : 'Reset your password';
  const subheading =
    mode === 'login'
      ? 'Sign in to your Spot fleet dashboard.'
      : mode === 'signup'
        ? 'Create your account and get your fleet on Spot.'
        : 'We’ll email you a link to set a new password.';

  return (
    <div className={`spot-site ${spotFontVars}`} data-theme="light">
      <Link className="auth-back" href="/">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to home
      </Link>
      <div className="auth-toggle">
        <SpotThemeToggle />
      </div>

      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-logo">
            <span className="logo">Spot<span className="dot" /></span>
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
