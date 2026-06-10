import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import FleetShell from '@/components/fleet/FleetShell';
import { getFleetBilling } from '@/lib/billing/fleet-billing';
import { getPlans } from '@/lib/billing/plans-data';
import { getPlanDef, TRIAL_DAYS } from '@/lib/billing/plans';
import styles from './fleetBilling.module.css';

export const dynamic = 'force-dynamic';

const Check = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const Arrow = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** A usage meter row: used vs cap (null cap = unlimited). */
function Meter({ label, used, cap }: { label: string; used: number; cap: number | null }) {
  const unlimited = cap === null;
  const pct = unlimited ? Math.min(100, used > 0 ? 12 : 4) : Math.min(100, cap === 0 ? 100 : (used / cap) * 100);
  const fillClass =
    !unlimited && pct >= 100 ? `${styles.fill} ${styles.fillFull}` : !unlimited && pct >= 80 ? `${styles.fill} ${styles.fillWarn}` : styles.fill;
  return (
    <div className={styles.meter}>
      <div className={styles.meterTop}>
        <span className={styles.meterLabel}>{label}</span>
        <span className={styles.meterValue}>
          {used} <span>/ {unlimited ? '∞' : cap}</span>
        </span>
      </div>
      <div className={styles.track}>
        <div className={fillClass} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function FleetBillingPage() {
  const user = await requireRole(['admin', 'staff']);
  const isAdmin = user.role === 'admin';
  const [plans, billing] = await Promise.all([
    getPlans(),
    getFleetBilling(user.organization_id),
  ]);

  const currentDef = getPlanDef(plans, billing.plan); // undefined while on trial
  const recommendedDef = getPlanDef(plans, billing.requiredPlan);

  // Status pill.
  const paused = billing.status === 'suspended' || billing.status === 'cancelled';
  const pill = paused
    ? { cls: styles.pillPaused, label: 'Paused' }
    : billing.onTrial
      ? { cls: styles.pillTrial, label: billing.trialExpired ? 'Trial ended' : 'Free trial' }
      : { cls: styles.pillActive, label: 'Active' };

  // Hero copy.
  const planTitle = billing.onTrial ? 'Free trial' : currentDef?.name ?? billing.plan;
  const priceLabel = billing.onTrial ? 'Free' : currentDef?.priceLabel ?? '—';
  const priceUnit = billing.onTrial ? `for ${TRIAL_DAYS} days` : currentDef?.priceUnit ?? '';

  const subline = billing.onTrial
    ? billing.trialExpired
      ? 'Your trial has ended — choose a plan to keep managing your fleet.'
      : `${billing.trialDaysLeft} day${billing.trialDaysLeft === 1 ? '' : 's'} left · ends ${fmtDate(billing.trialEndsAt)}`
    : paused
      ? `This fleet has been ${billing.status}. Choose a plan to reactivate it.`
      : 'Billed monthly · active subscription';

  // Which features to show: current plan, or the recommended one during trial.
  const featureDef = currentDef ?? recommendedDef;
  const featuresHeading = billing.onTrial
    ? `What you’ll get on ${recommendedDef?.name ?? 'a paid plan'}`
    : 'Included in your plan';

  // Limits to chart against (current plan, or recommended during trial).
  const limitDef = currentDef ?? recommendedDef;
  const ctaLabel = billing.onTrial ? 'Choose a plan' : 'Change plan';

  return (
    <FleetShell user={user} title="Billing & plan">
      <div className={styles.container}>
        {/* Current plan */}
        <div className={styles.hero}>
          <div className={styles.heroLeft}>
            <div className={styles.eyebrow}>Current plan</div>
            <div className={styles.planName}>
              {planTitle}
              <span className={`${styles.pill} ${pill.cls}`}>
                <span className={styles.pillDot} />
                {pill.label}
              </span>
            </div>
            <div className={styles.price}>
              <strong>{priceLabel}</strong> {priceUnit}
            </div>
            <div className={styles.subline}>{subline}</div>
          </div>
          <div className={styles.heroRight}>
            {isAdmin ? (
              <Link href="/billing" className={styles.btnPrimary}>
                {ctaLabel} <Arrow />
              </Link>
            ) : (
              <div className={styles.staffNote}>Only a fleet admin can change the plan.</div>
            )}
          </div>
        </div>

        <div className={styles.grid}>
          {/* Usage */}
          <div className={styles.card}>
            <div className={styles.cardHead}>Usage</div>
            <div className={styles.cardBody}>
              <Meter label="Drivers" used={billing.drivers} cap={limitDef?.maxDrivers ?? null} />
              <Meter label="Vehicles" used={billing.vehicles} cap={limitDef?.maxVehicles ?? null} />
              {billing.overLimit && recommendedDef && (
                <div style={{ marginTop: 16, fontSize: 12.5, color: 'var(--warn)' }}>
                  You’ve outgrown this plan — the {recommendedDef.name} plan or higher is needed for your fleet size.
                </div>
              )}
            </div>
          </div>

          {/* Features */}
          <div className={styles.card}>
            <div className={styles.cardHead}>{featuresHeading}</div>
            <div className={styles.cardBody}>
              {featureDef?.features?.length ? (
                <ul className={styles.features}>
                  {featureDef.features.map((f) => (
                    <li key={f}>
                      <span className={styles.tick}><Check /></span>
                      {f}
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                  Full access to every feature during your trial.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.note}>
          <span>
            Questions about billing or need a custom plan?{' '}
            <a href="mailto:hello@rovora.eu?subject=Billing%20question">Talk to us</a>.
          </span>
        </div>
      </div>
    </FleetShell>
  );
}
