'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './GettingStartedCard.module.css';

export interface OnboardingState {
  hasDrivers: boolean;
  hasVehicles: boolean;
  /** Fleet has configured how drivers are paid (at least one settlement preset). */
  hasPay: boolean;
  /** Fleet has created at least one settlement. */
  hasSettlement: boolean;
}

const DISMISS_KEY = 'rovora-getting-started-dismissed';

interface Step {
  key: keyof OnboardingState;
  label: string;
  hint: string;
  href: string;
  cta: string;
}

const STEPS: Step[] = [
  { key: 'hasDrivers', label: 'Add your first driver', hint: 'Invite the people who drive for you', href: '/fleet/drivers/new', cta: 'Add driver' },
  { key: 'hasVehicles', label: 'Add your first vehicle', hint: 'Register a car in your fleet', href: '/fleet/vehicles/new', cta: 'Add vehicle' },
  { key: 'hasPay', label: 'Set up how you pay drivers', hint: 'A 2-minute guided interview', href: '/fleet/settlements/setup', cta: 'Set up pay' },
  { key: 'hasSettlement', label: 'Run your first settlement', hint: 'Reconcile a driver’s week', href: '/fleet/settlements', cta: 'Open settlements' },
];

/**
 * Dismissible "getting started" checklist on the fleet dashboard. Each step
 * auto-checks from real data; the card hides itself once every step is done or
 * the admin dismisses it. This is the low-friction whole-dashboard onboarding —
 * a checklist, not a forced tour.
 */
export default function GettingStartedCard({ state }: { state: OnboardingState }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') setDismissed(true);
    } catch {
      /* ignore */
    }
  }, []);

  const done = STEPS.filter((s) => state[s.key]).length;
  const allDone = done === STEPS.length;

  // Nothing to nudge once everything's done (or the admin closed it).
  if (allDone || dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  // The first not-yet-done step is the "next" one — highlighted.
  const nextKey = STEPS.find((s) => !state[s.key])?.key;

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <div>
          <div className={styles.title}>Get your fleet up and running</div>
          <div className={styles.sub}>{done} of {STEPS.length} done — finish setup to unlock the full dashboard.</div>
        </div>
        <button type="button" className={styles.dismiss} onClick={dismiss} title="Dismiss" aria-label="Dismiss getting started">
          ✕
        </button>
      </div>

      <div className={styles.progressTrack}>
        <div className={styles.progressFill} style={{ width: `${(done / STEPS.length) * 100}%` }} />
      </div>

      <div className={styles.steps}>
        {STEPS.map((s) => {
          const complete = state[s.key];
          const isNext = s.key === nextKey;
          return (
            <div key={s.key} className={`${styles.step} ${complete ? styles.stepDone : ''} ${isNext ? styles.stepNext : ''}`}>
              <span className={`${styles.check} ${complete ? styles.checkDone : ''}`} aria-hidden>
                {complete ? '✓' : ''}
              </span>
              <span className={styles.stepText}>
                <span className={styles.stepLabel}>{s.label}</span>
                <span className={styles.stepHint}>{s.hint}</span>
              </span>
              {!complete && (
                <Link href={s.href} className={`btn btn-sm ${isNext ? 'btn-primary' : 'btn-secondary'}`}>
                  {s.cta}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
