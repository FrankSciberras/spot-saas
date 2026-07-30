'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { rovoraFontVars } from '@/lib/rovoraFonts';
import RovoraThemeToggle from '@/components/marketing/RovoraThemeToggle';
import PasswordInput from '@/components/shared/PasswordInput';

/**
 * Set-password screen — the destination for recovery links and fleet invites.
 *
 * Shares the auth shell (`auth-wrap` / `auth-card` / `field` / `btn`) with
 * /login rather than carrying its own stylesheet, so the last step of the reset
 * flow looks like the first. It used to render a dark card on a blue-green
 * gradient that matched nothing else in the product.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setIsValidSession(Boolean(session));
    };

    checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Those passwords don’t match.');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push('/login'), 3000);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const heading = success
    ? 'Password updated'
    : isValidSession === false
      ? 'This link has expired'
      : 'Set a new password';

  const subheading = success
    ? 'You can sign in with your new password now — taking you there in a moment.'
    : isValidSession === false
      ? 'Password reset links can only be used once, and expire after an hour. Request a fresh one to continue.'
      : isValidSession === null
        ? 'Checking your reset link…'
        : 'Choose a password you don’t use anywhere else.';

  return (
    <div className={`rovora-site ${rovoraFontVars}`} data-theme="light">
      <Link className="auth-back" href="/">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to home
      </Link>
      <div className="auth-toggle">
        <RovoraThemeToggle />
      </div>

      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <span className="logo"><img src="/logo-full.png" alt="Rovora" /></span>
          </div>

          <div className="auth-head">
            <h1>{heading}</h1>
            <p>{subheading}</p>
          </div>

          {error && <div className="auth-alert err">{error}</div>}

          {isValidSession === null ? null : isValidSession === false ? (
            <button type="button" className="btn btn-primary btn-lg" onClick={() => router.push('/login')}>
              Request a new link
            </button>
          ) : success ? (
            <button type="button" className="btn btn-primary btn-lg" onClick={() => router.push('/login')}>
              Go to sign in
            </button>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="newPassword">New password</label>
                <PasswordInput
                  id="newPassword"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>

              <div className="field">
                <label htmlFor="confirmPassword">Confirm password</label>
                <PasswordInput
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Type it again"
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-lg"
                disabled={loading || !newPassword || !confirmPassword}
              >
                {loading ? 'Updating…' : 'Update password'}
              </button>

              <p className="auth-foot">
                Remembered it?{' '}
                <Link href="/login" className="auth-link">Back to sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
