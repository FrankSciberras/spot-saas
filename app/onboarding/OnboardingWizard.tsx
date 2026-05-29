'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { completeOnboardingAction } from '@/lib/actions/org';
import type { Plan, PaidPlan, PlanDef } from '@/lib/billing/plans';
import styles from './onboarding.module.css';

interface Range {
  id: string;
  label: string;
  /** Upper bound used to recommend a plan (50+ uses a value past every cap). */
  max: number;
}

const RANGES: Range[] = [
  { id: '1-5', label: '1–5', max: 5 },
  { id: '6-10', label: '6–10', max: 10 },
  { id: '11-25', label: '11–25', max: 25 },
  { id: '26-50', label: '26–50', max: 50 },
  { id: '50+', label: '50+', max: 100 },
];

/** Smallest plan that fits the projected counts (higher of the two wins). */
function recommend(driverMax: number, vehicleMax: number): PaidPlan {
  const n = Math.max(driverMax, vehicleMax);
  if (n > 50) return 'scale';
  if (n > 10) return 'growth';
  return 'starter';
}

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

const TOTAL_STEPS = 4;

export default function OnboardingWizard({ plans }: { plans: PlanDef[] }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [drivers, setDrivers] = useState<Range | null>(null);
  const [vehicles, setVehicles] = useState<Range | null>(null);
  const [error, setError] = useState('');
  const [pendingChoice, setPendingChoice] = useState<Plan | null>(null);
  const [isPending, startTransition] = useTransition();

  const recommended = drivers && vehicles ? recommend(drivers.max, vehicles.max) : 'starter';

  const next = () => {
    setError('');
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  };
  const back = () => {
    setError('');
    setStep((s) => Math.max(s - 1, 0));
  };

  const finish = (plan: Plan) => {
    if (!name.trim()) {
      setError('Please enter a name for your fleet.');
      setStep(0);
      return;
    }
    setError('');
    setPendingChoice(plan);
    startTransition(async () => {
      const result = await completeOnboardingAction(name, plan);
      // On success the action redirects; only an error object returns here.
      if (result?.error) {
        setError(result.error);
        setPendingChoice(null);
      }
    });
  };

  const wide = step === 3;

  return (
    <div className={styles.container}>
      <div className={`${styles.card} ${wide ? styles.cardWide : ''}`}>
        <div className={styles.header}>
          <Image
            src="/Black Logo.svg"
            alt="Spot Dashboard logo"
            className={styles.logo}
            width={160}
            height={44}
            priority
          />
        </div>

        <div className={styles.progress} aria-hidden>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <span
              key={i}
              className={`${styles.progressDot} ${i === step ? styles.progressActive : ''} ${i < step ? styles.progressDone : ''}`}
            />
          ))}
        </div>

        {error && <div className={styles.error}>{error}</div>}

        {/* Step 1 — fleet name */}
        {step === 0 && (
          <div className={styles.step}>
            <h1 className={styles.title}>Set up your fleet</h1>
            <p className={styles.subtitle}>
              What should we call your fleet? You&apos;ll be its admin — with a free
              30-day trial, no credit card required.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) next();
              }}
            >
              <div className="form-group">
                <label htmlFor="fleet-name" className="form-label">Fleet name</label>
                <input
                  id="fleet-name"
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Acme Cabs"
                  autoFocus
                />
              </div>
              <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={!name.trim()}>
                Continue
              </button>
            </form>
          </div>
        )}

        {/* Step 2 — driver count */}
        {step === 1 && (
          <div className={styles.step}>
            <h1 className={styles.title}>How many drivers?</h1>
            <p className={styles.subtitle}>
              Roughly how many drivers will you manage? This just helps us suggest the
              right plan — you can change it any time.
            </p>
            <div className={styles.rangeGrid}>
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`${styles.rangeBtn} ${drivers?.id === r.id ? styles.rangeBtnActive : ''}`}
                  onClick={() => setDrivers(r)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className={styles.navRow}>
              <button type="button" className="btn btn-secondary" onClick={back}>Back</button>
              <button type="button" className="btn btn-primary" disabled={!drivers} onClick={next}>Continue</button>
            </div>
          </div>
        )}

        {/* Step 3 — vehicle count */}
        {step === 2 && (
          <div className={styles.step}>
            <h1 className={styles.title}>How many vehicles?</h1>
            <p className={styles.subtitle}>
              And how many vehicles are in your fleet?
            </p>
            <div className={styles.rangeGrid}>
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`${styles.rangeBtn} ${vehicles?.id === r.id ? styles.rangeBtnActive : ''}`}
                  onClick={() => setVehicles(r)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className={styles.navRow}>
              <button type="button" className="btn btn-secondary" onClick={back}>Back</button>
              <button type="button" className="btn btn-primary" disabled={!vehicles} onClick={next}>Continue</button>
            </div>
          </div>
        )}

        {/* Step 4 — plan recommendation + trial */}
        {step === 3 && (
          <div className={styles.step}>
            <h1 className={styles.title}>Pick a plan</h1>
            <p className={styles.subtitle}>
              Based on your fleet size we suggest <strong>{plans.find((p) => p.id === recommended)?.name}</strong>.
              Start free for 30 days — no card needed — or choose a plan now.
            </p>

            <div className={styles.planGrid}>
              {plans.map((plan) => {
                const isRec = plan.id === recommended;
                const loading = isPending && pendingChoice === plan.id;
                return (
                  <div key={plan.id} className={`${styles.planCard} ${isRec ? styles.planRecommended : ''}`}>
                    {isRec && <span className={styles.planBadge}>Recommended</span>}
                    <div className={styles.planName}>{plan.name}</div>
                    <div className={styles.planPrice}>
                      {plan.priceLabel}
                      {plan.priceLabel !== 'Custom' && <span> / mo</span>}
                    </div>
                    <ul className={styles.planFeatures}>
                      {plan.features.map((f) => (
                        <li key={f}><Check />{f}</li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className={`${styles.planBtn} ${isRec ? styles.planBtnPrimary : ''}`}
                      disabled={isPending}
                      onClick={() => finish(plan.id)}
                    >
                      {loading ? 'Setting up…' : `Choose ${plan.name}`}
                    </button>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="btn btn-primary btn-full btn-lg"
              disabled={isPending}
              onClick={() => finish('trial')}
            >
              {isPending && pendingChoice === 'trial' ? (
                <>
                  <span className="spinner"></span>
                  Creating your fleet…
                </>
              ) : (
                'Start free 30-day trial'
              )}
            </button>

            <div className={styles.navRow} style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-secondary" disabled={isPending} onClick={back}>Back</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
