'use client';

import { useRef, useState, useTransition } from 'react';
import { submitInquiryAction } from '@/lib/actions/contact';
import styles from './contact.module.css';

const TOPICS: { value: string; label: string }[] = [
  { value: 'sales', label: 'Sales & demos' },
  { value: 'support', label: 'Product support' },
  { value: 'partnership', label: 'Partnerships' },
  { value: 'other', label: 'Something else' },
];

const FLEET_SIZES = ['1–5 vehicles', '6–15 vehicles', '16–50 vehicles', '50+ vehicles'];

/**
 * Public contact form. Posts to the submitInquiryAction server action, which
 * stores the inquiry for the platform admin's Inbox and emails the team.
 * On success it swaps itself for a thank-you panel.
 */
export default function ContactForm({ defaultTopic = 'sales' }: { defaultTopic?: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await submitInquiryAction(formData);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setSent(true);
    });
  };

  if (sent) {
    return (
      <div className={styles.card}>
        <div className={styles.success}>
          <div className={styles.successMark}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h3 className={styles.successTitle}>Thanks — we&rsquo;ve got it.</h3>
          <p className={styles.successBody}>
            Your message is on its way to our team. We usually reply within a few hours on business
            days, at the email you gave us.
          </p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setSent(false);
              formRef.current?.reset();
            }}
          >
            Send another message
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <form ref={formRef} className={styles.form} onSubmit={onSubmit} noValidate>
        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="cf-name">Your name</label>
            <input className={styles.input} id="cf-name" name="name" type="text" autoComplete="name" placeholder="Alex Murphy" required maxLength={120} />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="cf-email">Email</label>
            <input className={styles.input} id="cf-email" name="email" type="email" autoComplete="email" placeholder="alex@fleet.com" required maxLength={200} />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="cf-company">Fleet / company <span className={styles.opt}>· optional</span></label>
            <input className={styles.input} id="cf-company" name="company" type="text" autoComplete="organization" placeholder="Murphy Cabs" maxLength={160} />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="cf-phone">Phone <span className={styles.opt}>· optional</span></label>
            <input className={styles.input} id="cf-phone" name="phone" type="tel" autoComplete="tel" placeholder="+353 …" maxLength={40} />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="cf-topic">What&rsquo;s it about?</label>
            <select className={styles.select} id="cf-topic" name="topic" defaultValue={defaultTopic}>
              {TOPICS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="cf-size">Fleet size <span className={styles.opt}>· optional</span></label>
            <select className={styles.select} id="cf-size" name="fleet_size" defaultValue="">
              <option value="">Select…</option>
              {FLEET_SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="cf-message">How can we help?</label>
          <textarea className={styles.textarea} id="cf-message" name="message" placeholder="Tell us a little about your fleet and what you're looking for…" required minLength={10} maxLength={4000} />
        </div>

        {/* Honeypot — hidden from humans; bots that fill it are silently dropped. */}
        <div className={styles.hp} aria-hidden="true">
          <label htmlFor="cf-company-url">Company website</label>
          <input id="cf-company-url" name="company_url" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        {error && (
          <div className={styles.error} role="alert">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <div className={styles.foot}>
          <p className={styles.consent}>
            By sending this you agree to our <a href="/privacy">privacy policy</a>. We&rsquo;ll only use your details to reply.
          </p>
          <button type="submit" className={`btn btn-primary btn-lg ${styles.submit}`} disabled={pending}>
            {pending ? 'Sending…' : 'Send message'}
          </button>
        </div>
      </form>
    </div>
  );
}
