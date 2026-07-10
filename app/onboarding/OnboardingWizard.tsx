'use client';

import { useState, useTransition } from 'react';
import { completeOnboardingAction } from '@/lib/actions/org';
import { FLEET_MODULES } from '@/lib/modules/catalog';
import FleetIcon from '@/components/fleet/FleetIcon';
import { requiredPlanFor, type Plan, type PaidPlan, type PlanDef } from '@/lib/billing/plans';
import { rovoraFontVars } from '@/lib/rovoraFonts';
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

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

const TOTAL_STEPS = 5;

const TITLES = [
  'Set up your fleet',
  'How many drivers?',
  'How many vehicles?',
  'Choose your tools',
  'Pick a plan',
];

export default function OnboardingWizard({ plans }: { plans: PlanDef[] }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [drivers, setDrivers] = useState<Range | null>(null);
  const [vehicles, setVehicles] = useState<Range | null>(null);
  // Modules default ON; this set holds the ones the operator switched OFF.
  const [disabledModules, setDisabledModules] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [pendingChoice, setPendingChoice] = useState<Plan | null>(null);
  const [isPending, startTransition] = useTransition();

  const recommended: PaidPlan =
    drivers && vehicles ? requiredPlanFor(plans, drivers.max, vehicles.max) : plans[0]?.id ?? '';
  const recommendedName = plans.find((p) => p.id === recommended)?.name;

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
      const result = await completeOnboardingAction(name, plan, Array.from(disabledModules));
      if (result && 'url' in result && result.url) {
        // Paid plan → hand off to Stripe Checkout.
        window.location.assign(result.url);
        return;
      }
      // On success (trial / stub) the action redirects; only an error returns here.
      if (result && 'error' in result && result.error) {
        setError(result.error);
        setPendingChoice(null);
      }
    });
  };

  return (
    <div className={`${styles.page} ${rovoraFontVars}`}>
      <div className={styles.inner}>
        <div className={styles.head}>
          <div className={styles.brand}>
            <img src="/logo-full.png" alt="Rovora" className={styles.brandLogo} />
          </div>
          <h1>{TITLES[step]}</h1>
          <p>
            {step === 0 &&
              "What should we call your fleet? You'll be its admin — with a free 30-day trial, no credit card required."}
            {step === 1 &&
              'Roughly how many drivers will you manage? This just helps us suggest the right plan — you can change it any time.'}
            {step === 2 && 'And how many vehicles are in your fleet?'}
            {step === 3 &&
              'Pick the tools you want to start with. You can add or remove any of these later from Integrations — nothing is locked in.'}
            {step === 4 && (
              <>
                Based on your fleet size we suggest <strong>{recommendedName ?? 'a plan'}</strong>.
                Start free for 30 days — no card needed — or choose a plan now.
              </>
            )}
          </p>
        </div>

        <div className={styles.progress} aria-hidden>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <span
              key={i}
              className={`${styles.progressDot} ${i === step ? styles.progressActive : ''} ${i < step ? styles.progressDone : ''}`}
            />
          ))}
        </div>

        {/* Selections so far — same chip component as the billing screen. */}
        {(name.trim() || drivers || vehicles) && (
          <div className={styles.statusBar}>
            {name.trim() && (
              <span className={styles.chip}>
                Fleet: <strong>{name.trim()}</strong>
              </span>
            )}
            {drivers && (
              <span className={styles.chip}>
                Drivers: <strong>{drivers.label}</strong>
              </span>
            )}
            {vehicles && (
              <span className={styles.chip}>
                Vehicles: <strong>{vehicles.label}</strong>
              </span>
            )}
          </div>
        )}

        {error && <div className={styles.error}>{error}</div>}

        {/* Step 1 — fleet name */}
        {step === 0 && (
          <div className={styles.step}>
            <form
              className={styles.formWrap}
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) next();
              }}
            >
              <label htmlFor="fleet-name" className={styles.fieldLabel}>Fleet name</label>
              <input
                id="fleet-name"
                type="text"
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme Cabs"
                autoFocus
              />
              <button
                type="submit"
                className={`${styles.btn} ${styles.btnPrimary} ${styles.btnFull} ${styles.btnLg}`}
                style={{ marginTop: 18 }}
                disabled={!name.trim()}
              >
                Continue
              </button>
            </form>
          </div>
        )}

        {/* Step 2 — driver count */}
        {step === 1 && (
          <div className={styles.step}>
            <div className={styles.formWrap}>
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
                <button type="button" className={styles.btn} onClick={back}>Back</button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  disabled={!drivers}
                  onClick={next}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3 — vehicle count */}
        {step === 2 && (
          <div className={styles.step}>
            <div className={styles.formWrap}>
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
                <button type="button" className={styles.btn} onClick={back}>Back</button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnPrimary}`}
                  disabled={!vehicles}
                  onClick={next}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4 — choose modules */}
        {step === 3 && (
          <div className={styles.step}>
            <div className={styles.formWrap} style={{ maxWidth: 640 }}>
              <div className={styles.modGrid}>
                {FLEET_MODULES.map((m) => {
                  const comingSoon = m.status !== 'available';
                  const on = !comingSoon && !disabledModules.has(m.key);
                  return (
                    <button
                      key={m.key}
                      type="button"
                      disabled={comingSoon}
                      aria-pressed={on}
                      className={`${styles.modCard} ${on ? styles.modCardOn : ''} ${comingSoon ? styles.modCardSoon : ''}`}
                      onClick={() => {
                        if (comingSoon) return;
                        setDisabledModules((prev) => {
                          const s = new Set(prev);
                          if (s.has(m.key)) s.delete(m.key);
                          else s.add(m.key);
                          return s;
                        });
                      }}
                    >
                      <span className={styles.modIcon} aria-hidden>
                        <FleetIcon name={m.icon} size={22} stroke={1.7} />
                      </span>
                      <span className={styles.modText}>
                        <span className={styles.modName}>
                          {m.name}
                          {comingSoon && <span className={styles.modSoon}>Coming soon</span>}
                        </span>
                        <span className={styles.modTagline}>{m.tagline}</span>
                      </span>
                      <span className={styles.modCheck} aria-hidden>✓</span>
                    </button>
                  );
                })}
              </div>
              <div className={styles.navRow}>
                <button type="button" className={styles.btn} onClick={back}>Back</button>
                <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={next}>
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 5 — plan recommendation + trial */}
        {step === 4 && (
          <div className={styles.step}>
            <div className={styles.grid}>
              {plans.map((plan) => {
                const isRec = plan.id === recommended;
                const loading = isPending && pendingChoice === plan.id;
                return (
                  <div key={plan.id} className={`${styles.card} ${isRec ? styles.required : ''}`}>
                    {isRec && <span className={styles.recommend}>Recommended</span>}
                    <div className={styles.planName}>{plan.name}</div>
                    <div className={styles.price}>
                      {plan.priceLabel}
                      {plan.priceUnit && <span> {plan.priceUnit}</span>}
                    </div>
                    <ul className={styles.features}>
                      {plan.features.map((f) => (
                        <li key={f}>
                          <Check />
                          {f}
                        </li>
                      ))}
                    </ul>
                    {plan.isCustom ? (
                      <a className={styles.cardBtn} href={plan.ctaHref ?? '/contact'}>
                        {plan.ctaLabel ?? 'Talk to us'}
                      </a>
                    ) : (
                      <button
                        type="button"
                        className={`${styles.cardBtn} ${isRec ? styles.cardBtnPrimary : ''}`}
                        disabled={isPending}
                        onClick={() => finish(plan.id)}
                      >
                        {loading ? 'Setting up…' : `Choose ${plan.name}`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className={styles.orTrial}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary} ${styles.btnFull} ${styles.btnLg}`}
                disabled={isPending}
                onClick={() => finish('trial')}
              >
                {isPending && pendingChoice === 'trial' ? (
                  <>
                    <span className={styles.spinner} />
                    Creating your fleet…
                  </>
                ) : (
                  'Start free 30-day trial'
                )}
              </button>
            </div>

            <div className={styles.navRow}>
              <button type="button" className={styles.btn} disabled={isPending} onClick={back}>
                Back
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
