import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import FleetShell from '@/components/fleet/FleetShell';
import { getFleetBilling } from '@/lib/billing/fleet-billing';
import { getPlans } from '@/lib/billing/plans-data';
import { getPlanDef, monthlyPriceFor, type PlanDef } from '@/lib/billing/plans';
import { listFleetInvoices, hasBillingAccount } from '@/lib/billing/invoices';
import ManageBillingButton from './ManageBillingButton';
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

const euro = (n: number) => `€${Number.isInteger(n) ? n : n.toFixed(2)}`;

/**
 * A usage meter row: used vs cap (null cap = unlimited). `included` marks how
 * many are covered by the plan price; the rest are billed per unit.
 */
function Meter({
  label,
  used,
  cap,
  included,
  perUnit,
}: {
  label: string;
  used: number;
  cap: number | null;
  included?: number | null;
  perUnit?: number | null;
}) {
  const unlimited = cap === null;
  const showIncluded = included != null && !unlimited && cap > 0 && included < cap;
  const extra = included != null ? Math.max(0, used - included) : 0;
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
        {showIncluded && (
          <div className={styles.includedMark} style={{ left: `${(included / cap) * 100}%` }} />
        )}
      </div>
      {included != null && (
        <div className={styles.meterNote}>
          {included} included in your plan
          {extra > 0
            ? ` · ${extra} extra${perUnit ? ` × ${euro(perUnit)} / mo` : ''}`
            : perUnit
              ? ` · extra ones ${euro(perUnit)} / mo each`
              : ''}
        </div>
      )}
    </div>
  );
}

export default async function FleetBillingPage() {
  const user = await requireRole(['admin', 'staff']);
  const isAdmin = user.role === 'admin';
  const [plans, billing, invoices] = await Promise.all([
    getPlans(),
    getFleetBilling(user.organization_id),
    listFleetInvoices(user.organization_id),
  ]);
  const hasStripeCustomer = invoices.length > 0 || (await hasBillingAccount(user.organization_id));

  const currentDef = getPlanDef(plans, billing.plan); // undefined while on trial
  const recommendedDef = getPlanDef(plans, billing.requiredPlan);

  // Status pill.
  const paused = billing.status === 'suspended' || billing.status === 'cancelled';
  const pill = paused
    ? { cls: styles.pillPaused, label: 'Paused' }
    : billing.onTrial
      ? { cls: styles.pillTrial, label: billing.trialExpired ? 'Free period ended' : 'Free' }
      : { cls: styles.pillActive, label: 'Active' };

  // Hero copy.
  const planTitle = billing.onTrial ? 'Free period' : currentDef?.name ?? billing.plan;
  // Real monthly total = plan price + vehicles beyond what it includes.
  const perVehicle = (d?: PlanDef) =>
    d && !d.isCustom && d.includedVehicles != null && d.perVehiclePrice ? d.perVehiclePrice : null;
  const extraVehicles = (d?: PlanDef) =>
    perVehicle(d) != null ? Math.max(0, billing.vehicles - (d!.includedVehicles ?? 0)) : 0;
  const billsMonthly = !billing.onTrial && !!currentDef && !currentDef.isCustom;
  const priceLabel = billing.onTrial
    ? 'Free'
    : billsMonthly
      ? euro(monthlyPriceFor(currentDef!, billing.vehicles))
      : currentDef?.priceLabel ?? '—';
  const priceUnit = billing.onTrial ? 'for now' : billsMonthly ? '/ mo' : currentDef?.priceUnit ?? '';
  const breakdown = billsMonthly
    ? extraVehicles(currentDef) > 0
      ? `${euro(currentDef!.priceAmount)} plan (${currentDef!.includedVehicles} vehicles included) + ${extraVehicles(currentDef)} extra vehicle${extraVehicles(currentDef) === 1 ? '' : 's'} × ${euro(perVehicle(currentDef)!)}`
      : currentDef!.includedVehicles != null
        ? `Includes ${currentDef!.includedVehicles} vehicles${perVehicle(currentDef) ? ` · ${euro(perVehicle(currentDef)!)} / mo per extra vehicle` : ''}`
        : null
    : billing.onTrial && recommendedDef && !recommendedDef.isCustom
      ? `On ${recommendedDef.name} your ${billing.vehicles} vehicle${billing.vehicles === 1 ? '' : 's'} would be ${euro(monthlyPriceFor(recommendedDef, billing.vehicles))} / mo`
      : null;

  const subline = billing.onTrial
    ? billing.trialExpired
      ? 'Your free period has ended — choose a plan to keep managing your fleet.'
      : `${billing.trialDaysLeft} free day${billing.trialDaysLeft === 1 ? '' : 's'} left · ends ${fmtDate(billing.trialEndsAt)}`
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
            {breakdown && <div className={styles.priceBreakdown}>{breakdown}</div>}
            <div className={styles.subline}>{subline}</div>
          </div>
          <div className={styles.heroRight}>
            {isAdmin ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                <Link href="/billing" className={styles.btnPrimary}>
                  {ctaLabel} <Arrow />
                </Link>
                {hasStripeCustomer && <ManageBillingButton className={styles.btnGhost} />}
              </div>
            ) : (
              <div className={styles.staffNote}>Only a fleet admin can change the plan.</div>
            )}
          </div>
        </div>

        {/* Invoices — straight from Stripe, newest first */}
        <div className={styles.card} style={{ marginBottom: 16 }}>
          <div className={styles.cardHead}>Invoices</div>
          {invoices.length === 0 ? (
            <div className={styles.cardBody} style={{ fontSize: 13, color: 'var(--text-3)' }}>
              {billing.onTrial
                ? 'No invoices yet — nothing is charged during your free period.'
                : 'No invoices yet.'}
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.invoiceTable}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Invoice</th>
                    <th>Description</th>
                    <th className={styles.num}>Amount</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>{fmtDate(inv.date)}</td>
                      <td className="mono">{inv.number ?? '—'}</td>
                      <td>{inv.description}</td>
                      <td className={`${styles.num} mono`}>
                        {inv.amount.toLocaleString('en-MT', { style: 'currency', currency: inv.currency })}
                      </td>
                      <td>
                        <span className={`${styles.invStatus} ${inv.status === 'paid' ? styles.invPaid : inv.status === 'open' ? styles.invOpen : ''}`}>
                          {inv.status === 'paid' ? 'Paid' : inv.status === 'open' ? 'Due' : inv.status}
                        </span>
                      </td>
                      <td className={styles.invLinks}>
                        {inv.pdfUrl && <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer">PDF</a>}
                        {inv.hostedUrl && <a href={inv.hostedUrl} target="_blank" rel="noopener noreferrer">{inv.status === 'open' ? 'Pay' : 'View'}</a>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className={styles.grid}>
          {/* Usage */}
          <div className={styles.card}>
            <div className={styles.cardHead}>Usage</div>
            <div className={styles.cardBody}>
              <Meter label="Drivers" used={billing.drivers} cap={limitDef?.maxDrivers ?? null} />
              <Meter
                label="Vehicles"
                used={billing.vehicles}
                cap={limitDef?.maxVehicles ?? null}
                included={limitDef && !limitDef.isCustom ? limitDef.includedVehicles : null}
                perUnit={perVehicle(limitDef)}
              />
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
                  Full access to every feature, free.
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
