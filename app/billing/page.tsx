import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { getFleetBilling, TRIAL_DAYS } from '@/lib/billing/plans';
import { spotFontVars } from '@/lib/spotFonts';
import PlanPicker from './PlanPicker';
import styles from './billing.module.css';

export const dynamic = 'force-dynamic';

/**
 * Upgrade / trial-status screen. Lives OUTSIDE /fleet so a locked fleet can
 * reach it without tripping the fleet layout gate. Shown when:
 *   - the fleet's trial has expired, or it outgrew its plan (locked), or
 *   - an operator wants to upgrade early during the trial.
 */
export default async function BillingPage() {
  const user = await requireRole(['admin', 'staff']);
  const billing = await getFleetBilling(user.organization_id);
  const isAdmin = user.role === 'admin';

  let heading: string;
  let sub: string;

  if (billing.trialExpired) {
    heading = 'Your free trial has ended';
    sub = `Your ${TRIAL_DAYS}-day trial of ${user.organization_name} is over. Choose a plan to keep managing your fleet.`;
  } else if (billing.overLimit) {
    heading = `You've outgrown the ${billing.plan} plan`;
    sub = `${user.organization_name} now has ${billing.drivers} drivers and ${billing.vehicles} vehicles. Move up to the ${billing.requiredPlan} plan to continue.`;
  } else if (billing.status === 'suspended' || billing.status === 'cancelled') {
    heading = 'Your fleet is paused';
    sub = `${user.organization_name} has been ${billing.status}. Choose a plan to reactivate it.`;
  } else if (billing.onTrial) {
    heading = `You're on a free trial`;
    sub = `${billing.trialDaysLeft} day${billing.trialDaysLeft === 1 ? '' : 's'} left. No card needed until you choose to upgrade.`;
  } else {
    heading = `You're on the ${billing.plan} plan`;
    sub = `Manage ${user.organization_name}'s subscription.`;
  }

  return (
    <div className={`${styles.page} ${spotFontVars}`}>
      <div className={styles.inner}>
        <div className={styles.head}>
          <div className={styles.brand}>
            Spot<span className={styles.brandDot} />
          </div>
          <h1>{heading}</h1>
          <p>{sub}</p>
        </div>

        <div className={styles.statusBar}>
          <span className={styles.chip}>
            Plan: <strong>{billing.plan}</strong>
          </span>
          <span className={styles.chip}>
            Drivers: <strong>{billing.drivers}</strong>
          </span>
          <span className={styles.chip}>
            Vehicles: <strong>{billing.vehicles}</strong>
          </span>
          {billing.onTrial && !billing.trialExpired && (
            <span className={`${styles.chip} ${styles.chipWarn}`}>
              Trial ends in <strong>{billing.trialDaysLeft} days</strong>
            </span>
          )}
        </div>

        <PlanPicker
          currentPlan={billing.plan}
          requiredPlan={billing.requiredPlan}
          isAdmin={isAdmin}
        />

        {!billing.locked && (
          <p className={styles.foot}>
            <Link href="/fleet">← Back to your dashboard</Link>
          </p>
        )}
      </div>
    </div>
  );
}
