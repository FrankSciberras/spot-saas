'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useTrialInfo } from './FleetBillingProvider';

const strip = (urgent: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 12,
  flexWrap: 'wrap',
  padding: '9px 16px',
  fontSize: 13.5,
  fontWeight: 500,
  color: urgent ? '#7a3a00' : '#1e3a5f',
  background: urgent ? '#fff3e0' : '#eef4ff',
  borderBottom: `1px solid ${urgent ? '#f5d29b' : '#d4e1fb'}`,
});

const cta: CSSProperties = {
  color: '#1a8f5a',
  fontWeight: 700,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
};

/**
 * Thin strip across the top of the fleet dashboard. Two cases:
 *   - free trial running: a countdown with a "choose a plan" link;
 *   - paid plan outgrown: an amber notice that adding drivers/vehicles is paused
 *     until the fleet upgrades (or removes the extras). The dashboard itself
 *     stays usable — the old behaviour of locking everyone out trapped
 *     operators on /billing with no way to delete the extra vehicle.
 * Reads billing from context (seeded by the server-side /fleet layout) so this
 * stays a pure client component with no server-only billing import.
 */
export default function FleetTrialBanner() {
  const trial = useTrialInfo();
  if (!trial) return null;

  if (trial.overLimit) {
    return (
      <div style={strip(true)}>
        <span>
          Your fleet has more drivers or vehicles than the {trial.planName ?? 'current'} plan
          allows. Adding more is paused until you upgrade
          {trial.requiredPlanName ? ` to ${trial.requiredPlanName}` : ''} or remove the extras.
        </span>
        <Link href="/billing" style={cta}>
          Upgrade plan →
        </Link>
      </div>
    );
  }

  if (!trial.onTrial || trial.trialExpired) return null;

  const urgent = trial.trialDaysLeft <= 5;

  return (
    <div style={strip(urgent)}>
      <span>
        {trial.trialDaysLeft} day{trial.trialDaysLeft === 1 ? '' : 's'} left in your free
        trial.
      </span>
      <Link href="/billing" style={cta}>
        Choose a plan →
      </Link>
    </div>
  );
}
