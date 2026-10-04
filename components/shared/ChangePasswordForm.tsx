'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { requestPasswordResetAction } from '@/lib/actions/auth-email';
import styles from './ChangePasswordForm.module.css';

/**
 * ChangePasswordForm - Allows users to change their password
 * Requires current password verification for security.
 *
 * People who only ever signed in with Google have no password to verify, so
 * they get a "create a password" path instead: we email them the same secure
 * (rate-limited, single-use) link as Forgot password, which proves they own the
 * inbox before a password can be added to the account.
 */
export default function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  // Set when the account has no email/password identity (Google-only).
  const [googleOnlyEmail, setGoogleOnlyEmail] = useState('');

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        const providers = user?.identities?.map((i) => i.provider) ?? [];
        if (user?.email && providers.length > 0 && !providers.includes('email')) {
          setGoogleOnlyEmail(user.email);
        }
      });
  }, []);

  const sendCreatePasswordLink = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await requestPasswordResetAction(googleOnlyEmail);
      if (!res.ok) {
        setError(res.error || 'Could not send the link. Please try again.');
        return;
      }
      setSuccess(`We’ve emailed a link to ${googleOnlyEmail}. Open it to create your password.`);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (currentPassword === newPassword) {
      setError('New password must be different from current password');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      // First, verify the current password by re-authenticating
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user?.email) {
        setError('Unable to verify user. Please try logging in again.');
        return;
      }

      // Verify current password by attempting to sign in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signInError) {
        setError('Current password is incorrect');
        return;
      }

      // Update the password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const alerts = (
    <>
      {error && (
        <div className={styles.error}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </div>
      )}

      {success && (
        <div className={styles.success}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          {success}
        </div>
      )}
    </>
  );

  if (googleOnlyEmail) {
    return (
      <div className={styles.form}>
        {alerts}
        <p>
          You sign in with Google, so there’s no Rovora password to change. Want to sign in with your
          email and a password as well — for example in the Rovora Driver app? We’ll email you a secure
          link to create one.
        </p>
        <button type="button" className={styles.submitBtn} onClick={sendCreatePasswordLink} disabled={loading}>
          {loading ? (
            <>
              <span className={styles.spinner}></span>
              Sending...
            </>
          ) : (
            'Email me a link to create a password'
          )}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {alerts}

      <div className={styles.field}>
        <label htmlFor="currentPassword" className={styles.label}>
          Current Password
        </label>
        <input
          id="currentPassword"
          type="password"
          className={styles.input}
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Enter your current password"
          required
          autoComplete="current-password"
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="newPassword" className={styles.label}>
          New Password
        </label>
        <input
          id="newPassword"
          type="password"
          className={styles.input}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Enter new password (min. 6 characters)"
          required
          minLength={6}
          autoComplete="new-password"
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="confirmPassword" className={styles.label}>
          Confirm New Password
        </label>
        <input
          id="confirmPassword"
          type="password"
          className={styles.input}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm your new password"
          required
          minLength={6}
          autoComplete="new-password"
        />
      </div>

      <button
        type="submit"
        className={styles.submitBtn}
        disabled={loading || !currentPassword || !newPassword || !confirmPassword}
      >
        {loading ? (
          <>
            <span className={styles.spinner}></span>
            Changing Password...
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Change Password
          </>
        )}
      </button>
    </form>
  );
}
