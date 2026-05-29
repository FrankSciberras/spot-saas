'use client';

import { useState, useTransition } from 'react';
import { activatePlanAction } from '@/lib/actions/billing';
import { PLANS, planRank, type Plan, type PaidPlan } from '@/lib/billing/plans';
import { createClient } from '@/lib/supabase/client';
import styles from './billing.module.css';

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

interface Props {
  currentPlan: Plan;
  requiredPlan: PaidPlan;
  isAdmin: boolean;
}

export default function PlanPicker({ currentPlan, requiredPlan, isAdmin }: Props) {
  const [error, setError] = useState('');
  const [pendingPlan, setPendingPlan] = useState<PaidPlan | null>(null);
  const [isPending, startTransition] = useTransition();

  const choose = (plan: PaidPlan) => {
    setError('');
    setPendingPlan(plan);
    startTransition(async () => {
      const result = await activatePlanAction(plan);
      if (result?.error) {
        setError(result.error);
        setPendingPlan(null);
      }
      // On success the action redirects to /fleet.
    });
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.assign('/login');
  };

  return (
    <>
      {error && <div className={styles.error}>{error}</div>}

      {!isAdmin && (
        <div className={styles.staffNote}>
          Only a fleet admin can choose a plan. Please ask your fleet&apos;s admin to upgrade.
        </div>
      )}

      <div className={styles.grid}>
        {PLANS.map((plan) => {
          const isRequired = plan.id === requiredPlan;
          const tooSmall = planRank(plan.id) < planRank(requiredPlan);
          const isCurrent = plan.id === currentPlan;
          return (
            <div key={plan.id} className={`${styles.card} ${isRequired ? styles.required : ''}`}>
              {isRequired && <span className={styles.recommend}>Recommended</span>}
              <div className={styles.planName}>{plan.name}</div>
              <div className={styles.price}>
                {plan.priceLabel}
                {plan.priceLabel !== 'Custom' && <span> / mo</span>}
              </div>
              <ul className={styles.features}>
                {plan.features.map((f) => (
                  <li key={f}>
                    <Check />
                    {f}
                  </li>
                ))}
              </ul>
              {isAdmin && (
                <>
                  <button
                    type="button"
                    className={`${styles.btn} ${isRequired ? styles.btnPrimary : ''}`}
                    disabled={isPending || tooSmall || isCurrent}
                    onClick={() => choose(plan.id)}
                  >
                    {isCurrent
                      ? 'Current plan'
                      : isPending && pendingPlan === plan.id
                        ? 'Activating…'
                        : `Choose ${plan.name}`}
                  </button>
                  {tooSmall && <p className={styles.tooSmall}>Too small for your fleet</p>}
                </>
              )}
            </div>
          );
        })}
      </div>

      <p className={styles.foot}>
        Need help choosing? <a href="mailto:hello@spot.example">Talk to us</a> · or{' '}
        <button type="button" className={styles.signout} onClick={handleSignOut}>
          sign out
        </button>
      </p>
    </>
  );
}
