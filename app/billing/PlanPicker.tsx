'use client';

import { useState, useTransition } from 'react';
import { activatePlanAction, openBillingPortalAction } from '@/lib/actions/billing';
import { planRank, type Plan, type PaidPlan, type PlanDef } from '@/lib/billing/plans';
import { createClient } from '@/lib/supabase/client';
import styles from './billing.module.css';

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

interface Props {
  plans: PlanDef[];
  currentPlan: Plan;
  requiredPlan: PaidPlan;
  isAdmin: boolean;
  /** Show the "Manage billing" portal button (org already has a Stripe customer). */
  canManageBilling?: boolean;
}

export default function PlanPicker({
  plans,
  currentPlan,
  requiredPlan,
  isAdmin,
  canManageBilling = false,
}: Props) {
  const [error, setError] = useState('');
  const [pendingPlan, setPendingPlan] = useState<PaidPlan | null>(null);
  const [portalPending, setPortalPending] = useState(false);
  const [isPending, startTransition] = useTransition();

  const choose = (plan: PaidPlan) => {
    setError('');
    setPendingPlan(plan);
    startTransition(async () => {
      const result = await activatePlanAction(plan);
      if (result && 'url' in result && result.url) {
        // Stripe Checkout — hand off to the hosted payment page.
        window.location.assign(result.url);
        return;
      }
      if (result && 'error' in result && result.error) {
        setError(result.error);
        setPendingPlan(null);
      }
      // Stub path: the action revalidates + redirects to /fleet itself.
    });
  };

  const manageBilling = () => {
    setError('');
    setPortalPending(true);
    startTransition(async () => {
      const result = await openBillingPortalAction();
      if ('url' in result && result.url) {
        window.location.assign(result.url);
        return;
      }
      if ('error' in result) setError(result.error);
      setPortalPending(false);
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
        {plans.map((plan) => {
          const isRequired = plan.id === requiredPlan;
          const tooSmall = planRank(plans, plan.id) < planRank(plans, requiredPlan);
          const isCurrent = plan.id === currentPlan;
          return (
            <div key={plan.id} className={`${styles.card} ${isRequired ? styles.required : ''}`}>
              {isRequired && <span className={styles.recommend}>Recommended</span>}
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
              {isAdmin && (
                plan.isCustom ? (
                  <a
                    className={styles.btn}
                    href={plan.ctaHref ?? 'mailto:hello@rovora.eu'}
                  >
                    {plan.ctaLabel ?? 'Contact us'}
                  </a>
                ) : (
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
                )
              )}
            </div>
          );
        })}
      </div>

      {isAdmin && canManageBilling && (
        <div className={styles.manageRow}>
          <button
            type="button"
            className={styles.btn}
            disabled={isPending || portalPending}
            onClick={manageBilling}
          >
            {portalPending ? 'Opening…' : 'Manage billing · update card or cancel'}
          </button>
        </div>
      )}

      <p className={styles.foot}>
        Need help choosing? <a href="/contact">Talk to us</a> · or{' '}
        <button type="button" className={styles.signout} onClick={handleSignOut}>
          sign out
        </button>
      </p>
    </>
  );
}
