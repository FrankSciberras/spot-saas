'use client';

import { useState, type ComponentPropsWithoutRef } from 'react';
import styles from './PasswordInput.module.css';

const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.73 5.08a10.74 10.74 0 0 1 11.21 6.57 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-1.45 2.49" />
    <path d="M14.08 14.16a3 3 0 0 1-4.24-4.24" />
    <path d="M17.48 17.5a10.75 10.75 0 0 1-15.42-5.15 1 1 0 0 1 0-.7 10.75 10.75 0 0 1 4.45-5.14" />
    <path d="m2 2 20 20" />
  </svg>
);

/**
 * Password field with a show/hide toggle.
 *
 * Drop-in replacement for `<input type="password" />` — it forwards every prop
 * (id, value, onChange, autoComplete, required, minLength…) straight through, so
 * password managers and form validation behave exactly as before.
 *
 * Deliberately unstyled beyond the toggle itself: the caller's `className` still
 * drives the input's appearance, which is why this works both inside the
 * `.rovora-site` auth card and on the `form-input`-styled reset-password page.
 * The only style it forces is right padding, applied inline so it wins against
 * whichever design system the input is borrowing from.
 */
export default function PasswordInput({
  style,
  ...inputProps
}: Omit<ComponentPropsWithoutRef<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false);
  const label = visible ? 'Hide password' : 'Show password';

  return (
    <span className={styles.wrap}>
      <input
        {...inputProps}
        type={visible ? 'text' : 'password'}
        // Reserve room for the toggle so long passwords never run underneath it.
        style={{ paddingRight: 46, ...style }}
      />
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setVisible((v) => !v)}
        aria-label={label}
        aria-pressed={visible}
        title={label}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </span>
  );
}
