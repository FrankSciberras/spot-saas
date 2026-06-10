'use client';

import Link from 'next/link';
import { useTrialInfo } from './FleetBillingProvider';

/**
 * Thin countdown strip shown across the top of the fleet dashboard while a fleet
 * is on its free trial. Reads the trial status from context (seeded by the
 * server-side /fleet layout) so this stays a pure client component — no
 * server-only billing import, which would otherwise leak `next/headers` into
 * the client bundle via DashboardLayout. Renders nothing once the fleet is on a
 * paid plan or the trial has expired (the layout has already gated that case).
 */
export default function FleetTrialBanner() {
  const trial = useTrialInfo();

  if (!trial || !trial.onTrial || trial.trialExpired) return null;

  const urgent = trial.trialDaysLeft <= 5;

  return (
    <div
      style={{
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
      }}
    >
      <span>
        {trial.trialDaysLeft} day{trial.trialDaysLeft === 1 ? '' : 's'} left in your free
        trial.
      </span>
      <Link
        href="/billing"
        style={{
          color: '#1a8f5a',
          fontWeight: 700,
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        Choose a plan →
      </Link>
    </div>
  );
}
