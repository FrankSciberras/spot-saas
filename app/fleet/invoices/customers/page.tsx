import { Suspense } from 'react';
import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import { createAdminClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import { listCustomers } from '@/lib/invoices/server';
import CustomersWorkspace from './CustomersWorkspace';

type FleetUser = Awaited<ReturnType<typeof requireRole>>;

/** The people and companies the fleet invoices. */
export default async function InvoiceCustomersPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const user = await requireRole(['admin']);
  await requireModule(user.organization_id, 'invoices');
  const { new: openNew } = await searchParams;
  return (
    <FleetShell user={user} title="Invoice customers">
      <Suspense fallback={<FleetPageSkeleton variant="list" stats={0} />}>
        <CustomersContent user={user} openNew={openNew === '1'} />
      </Suspense>
    </FleetShell>
  );
}

async function CustomersContent({ user, openNew }: { user: FleetUser; openNew: boolean }) {
  const admin = createAdminClient();
  const orgId = user.organization_id;
  const [customers, docs] = await Promise.all([
    listCustomers(admin, orgId, { includeArchived: true }),
    admin.from('invoices').select('customer_id').eq('organization_id', orgId).limit(5000),
  ]);

  // How many documents each customer has — decides between "delete" and "archive".
  const counts: Record<string, number> = {};
  for (const row of docs.data ?? []) {
    const key = row.customer_id as string;
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return <CustomersWorkspace customers={customers} documentCounts={counts} openNew={openNew} />;
}
