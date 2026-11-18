import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import { createAdminClient } from '@/lib/supabase/server';
import { getFleetSettings } from '@/lib/settings/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import { ensureInvoiceSettings, invoiceToday, listCustomers } from '@/lib/invoices/server';
import InvoiceEditor from '../InvoiceEditor';
import styles from '../invoices.module.css';

type FleetUser = Awaited<ReturnType<typeof requireRole>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A new invoice. Nothing is stored until "Save draft" or "Issue" is pressed. */
export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ customer?: string }> }) {
  const user = await requireRole(['admin']);
  await requireModule(user.organization_id, 'invoices');
  const { customer } = await searchParams;
  return (
    <FleetShell user={user} title="New invoice">
      <Suspense fallback={<FleetPageSkeleton variant="list" stats={0} />}>
        <NewInvoiceContent user={user} customerId={customer && UUID.test(customer) ? customer : null} />
      </Suspense>
    </FleetShell>
  );
}

async function NewInvoiceContent({ user, customerId }: { user: FleetUser; customerId: string | null }) {
  const admin = createAdminClient();
  const orgId = user.organization_id;
  const [{ settings, error }, customers, fleet] = await Promise.all([
    ensureInvoiceSettings(admin, orgId),
    listCustomers(admin, orgId),
    getFleetSettings(orgId),
  ]);

  if (error || !settings) {
    return (
      <div className={styles.notice} role="status">
        {error ?? 'Invoice settings could not be loaded. Please try again.'}
      </div>
    );
  }

  return (
    <InvoiceEditor
      draft={null}
      kind="invoice"
      customers={customers}
      settings={settings}
      today={invoiceToday()}
      currency={fleet['finance.currency']}
      presetCustomerId={customerId && customers.some((c) => c.id === customerId) ? customerId : null}
    />
  );
}
