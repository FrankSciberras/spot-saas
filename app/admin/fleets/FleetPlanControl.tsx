'use client';

import { useState, useTransition } from 'react';
import {
  setFleetPlanAction,
  extendTrialAction,
  setFleetStatusAction,
} from '@/lib/actions/platform-billing';
import type { Plan } from '@/lib/billing/plans';
import styles from '../platform.module.css';

const PLAN_OPTIONS: Plan[] = ['trial', 'starter', 'growth', 'scale'];

interface Props {
  organizationId: string;
  plan: Plan;
  status: string;
}

export default function FleetPlanControl({ organizationId, plan, status }: Props) {
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const suspended = status === 'suspended' || status === 'cancelled';

  const run = (fn: () => Promise<{ error?: string; ok?: boolean }>) => {
    setError('');
    startTransition(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
    });
  };

  return (
    <details className={styles.manage}>
      <summary className={styles.manageToggle}>Manage</summary>
      <div className={styles.managePanel}>
        {error && <div className={styles.manageError}>{error}</div>}

        <div className={styles.manageRow}>
          <span className={styles.manageLabel}>Plan</span>
          <div className={styles.manageBtns}>
            {PLAN_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                disabled={isPending || p === plan}
                className={`${styles.miniBtn} ${p === plan ? styles.miniBtnActive : ''}`}
                onClick={() => run(() => setFleetPlanAction(organizationId, p))}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.manageRow}>
          <span className={styles.manageLabel}>Trial</span>
          <div className={styles.manageBtns}>
            <button
              type="button"
              disabled={isPending}
              className={styles.miniBtn}
              onClick={() => run(() => extendTrialAction(organizationId, 7))}
            >
              +7 days
            </button>
            <button
              type="button"
              disabled={isPending}
              className={styles.miniBtn}
              onClick={() => run(() => extendTrialAction(organizationId, 30))}
            >
              +30 days
            </button>
          </div>
        </div>

        <div className={styles.manageRow}>
          <span className={styles.manageLabel}>Status</span>
          <div className={styles.manageBtns}>
            {suspended ? (
              <button
                type="button"
                disabled={isPending}
                className={styles.miniBtn}
                onClick={() => run(() => setFleetStatusAction(organizationId, 'active'))}
              >
                Reactivate
              </button>
            ) : (
              <button
                type="button"
                disabled={isPending}
                className={`${styles.miniBtn} ${styles.miniBtnDanger}`}
                onClick={() => run(() => setFleetStatusAction(organizationId, 'suspended'))}
              >
                Suspend
              </button>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}
