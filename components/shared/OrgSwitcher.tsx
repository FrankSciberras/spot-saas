'use client';

// =============================================================================
// ORG SWITCHER — fleet selector for users who belong to more than one org.
// =============================================================================
// Renders nothing when the user has 0 or 1 memberships (the common case).
// On change it calls the setActiveOrgAction server action, which validates
// membership, writes the active_org cookie, and revalidates the layout.
// =============================================================================

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { MembershipInfo } from '@/lib/types/database';
import { setActiveOrgAction } from '@/lib/actions/org';
import styles from './OrgSwitcher.module.css';

interface OrgSwitcherProps {
  memberships: MembershipInfo[];
  activeOrgId: string;
}

export default function OrgSwitcher({ memberships, activeOrgId }: OrgSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Nothing to switch between.
  if (!memberships || memberships.length < 2) return null;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    if (next === activeOrgId) return;
    startTransition(async () => {
      await setActiveOrgAction(next);
      router.refresh();
    });
  };

  return (
    <div className={styles.switcher}>
      <label htmlFor="org-switcher" className={styles.label}>
        Fleet
      </label>
      <select
        id="org-switcher"
        className={styles.select}
        value={activeOrgId}
        onChange={handleChange}
        disabled={isPending}
      >
        {memberships.map((m) => (
          <option key={m.organization_id} value={m.organization_id}>
            {m.organization_name || m.organization_slug || 'Unnamed fleet'}
          </option>
        ))}
      </select>
    </div>
  );
}
