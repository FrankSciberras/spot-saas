import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import { createAdminClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import { listCustomers, listDocuments, invoiceToday } from '@/lib/invoices/server';
import { addDays, toCents } from '@/lib/invoices/math';
import InvoicesWorkspace from './InvoicesWorkspace';

type FleetUser = Awaited<ReturnType<typeof requireRole>>;

/**
 * Invoices — every invoice and credit note of the fleet, what is still owed,
 * and the way in to create a new one. Admins only: these are the fleet's books.
 */
export default async function InvoicesPage() {
  const user = await requireRole(['admin']);
  await requireModule(user.organization_id, 'invoices');
  return (
    <FleetShell user={user} title="Invoices">
      <Suspense fallback={<FleetPageSkeleton variant="list" stats={4} />}>
        <InvoicesContent user={user} />
      </Suspense>
    </FleetShell>
  );
}

async function InvoicesContent({ user }: { user: FleetUser }) {
  const admin = createAdminClient();
  const orgId = user.organization_id;
  const today = invoiceToday();
  const since = addDays(today, -30);

  const [{ documents, error }, customers, recent] = await Promise.all([
    listDocuments(admin, orgId),
    listCustomers(admin, orgId),
    admin.from('invoice_payments').select('invoice_id, amount, paid_on').eq('organization_id', orgId).gte('paid_on', since),
  ]);

  // Money received on invoices in the last 30 days (refunds on credit notes are not income).
  const invoiceIds = new Set(documents.filter((d) => d.kind === 'invoice').map((d) => d.id));
  const paidLast30 = (recent.data ?? [])
    .filter((p) => invoiceIds.has(p.invoice_id as string))
    .reduce((sum, p) => sum + (toCents(p.amount as number) ?? 0), 0);

  return (
    <InvoicesWorkspace
      documents={documents}
      error={error}
      customerCount={customers.length}
      paidLast30Cents={paidLast30}
    />
  );
}
