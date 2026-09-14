'use client';

import { useState, useTransition } from 'react';
import { openBillingPortalAction } from '@/lib/actions/billing';

/**
 * Opens Stripe's customer portal (card, invoices, cancel). Admin-only on the
 * server; the button simply isn't rendered for staff.
 */
export default function ManageBillingButton({ className, label = 'Manage payment method' }: { className: string; label?: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const open = () => {
    setError('');
    startTransition(async () => {
      const res = await openBillingPortalAction();
      if ('url' in res) {
        window.location.assign(res.url);
        return;
      }
      setError(res.error);
    });
  };

  return (
    <>
      <button type="button" className={className} onClick={open} disabled={isPending}>
        {isPending ? 'Opening…' : label}
      </button>
      {error && <div style={{ fontSize: 12.5, color: 'var(--neg)', marginTop: 6 }}>{error}</div>}
    </>
  );
}
