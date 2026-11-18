import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import { createAdminClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import { ensureInvoiceSettings, getDocument, invoiceToday, listCustomers } from '@/lib/invoices/server';
import InvoiceEditor, { type CreditedInvoice } from '../InvoiceEditor';
import DocumentView from '../DocumentView';

type FleetUser = Awaited<ReturnType<typeof requireRole>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One invoice or credit note. A draft opens in the editor; an issued or voided
 * document is shown as the customer sees it, with its payments and actions.
 */
export default async function InvoiceDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(['admin']);
  await requireModule(user.organization_id, 'invoices');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return (
    <FleetShell user={user} title="Invoices">
      <Suspense fallback={<FleetPageSkeleton variant="list" stats={0} />}>
        <DocumentContent user={user} id={id} />
      </Suspense>
    </FleetShell>
  );
}

async function DocumentContent({ user, id }: { user: FleetUser; id: string }) {
  const admin = createAdminClient();
  const orgId = user.organization_id;
  const doc = await getDocument(admin, orgId, id);
  if (!doc) notFound();
  const today = invoiceToday();

  if (doc.status === 'draft') {
    const [{ settings }, activeCustomers, original] = await Promise.all([
      ensureInvoiceSettings(admin, orgId),
      listCustomers(admin, orgId),
      doc.kind === 'credit_note' && doc.credited_invoice_id ? getDocument(admin, orgId, doc.credited_invoice_id) : Promise.resolve(null),
    ]);
    // A draft for a customer archived since must still show who it is for.
    const customers =
      doc.customer && !activeCustomers.some((c) => c.id === doc.customer_id) ? [...activeCustomers, doc.customer] : activeCustomers;
    const credited: CreditedInvoice | null = original
      ? { id: original.id, number: original.number, issue_date: original.issue_date, creditable_cents: original.creditable_cents }
      : null;

    return (
      <InvoiceEditor
        draft={doc}
        kind={doc.kind}
        customers={customers}
        settings={settings}
        today={today}
        currency={doc.currency}
        credited={credited}
      />
    );
  }

  // Read-only: only needed to word the payment dialog honestly.
  const { data: settings } = await admin
    .from('invoice_settings')
    .select('record_payments_in_books, income_category_id, refund_category_id')
    .eq('organization_id', orgId)
    .maybeSingle();
  const postsToBooks = Boolean(
    settings?.record_payments_in_books && (doc.kind === 'invoice' ? settings.income_category_id : settings.refund_category_id),
  );

  return <DocumentView doc={doc} today={today} postsToBooks={postsToBooks} />;
}
