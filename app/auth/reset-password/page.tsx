'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import styles from './reset-password.module.css';

/**
 * Reset Password Page - Allows users to set a new password after clicking the reset link
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
    // Check if user has a valid recovery session
    const checkSession = async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        setIsValidSession(true);
      } else {
        setIsValidSession(false);
      }
    };

    checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setSuccess(true);
      
      // Redirect to login after a short delay
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Show loading state while checking session
  if (isValidSession === null) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.loadingState}>
            <span className={styles.spinner}></span>
            <p>Verifying your reset link...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show error if no valid session
  if (isValidSession === false) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.header}>
            <div className={styles.logo}>
              <Image
                src="/rovora logo trimmed.png"
                alt="Rovora logo"
                className={styles.logoImage}
                width={200}
                height={50}
                style={{ width: 'auto', height: 'auto' }}
                priority
              />
            </div>
          </div>
          <div className={styles.errorState}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <h2>Invalid or Expired Link</h2>
            <p>This password reset link is invalid or has expired. Please request a new one.</p>
            <button
              className={styles.primaryBtn}
              onClick={() => router.push('/login')}
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show success state
  if (success) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.header}>
            <div className={styles.logo}>
              <Image
                src="/rovora logo trimmed.png"
                alt="Rovora logo"
                className={styles.logoImage}
                width={200}
                height={50}
                style={{ width: 'auto', height: 'auto' }}
                priority
              />
            </div>
          </div>
          <div className={styles.successState}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <h2>Password Reset Successfully!</h2>
            <p>Your password has been updated. You will be redirected to the login page shortly.</p>
            <button
              className={styles.primaryBtn}
              onClick={() => router.push('/login')}
            >
              Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.logo}>
            <Image
              src="/rovora logo trimmed.png"
              alt="Rovora logo"
              className={styles.logoImage}
              width={200}
              height={50}
              style={{ width: 'auto', height: 'auto' }}
              priority
            />
          </div>
          <p className={styles.subtitle}>Set your new password</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="newPassword" className="form-label">
              New Password
            </label>
            <input
              id="newPassword"
              type="password"
              className="form-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password (min. 6 characters)"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword" className="form-label">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              className="form-input"
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
            className={`btn btn-primary btn-full btn-lg ${styles.submitBtn}`}
            disabled={loading || !newPassword || !confirmPassword}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Updating Password...
              </>
            ) : (
              'Reset Password'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
