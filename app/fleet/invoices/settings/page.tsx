import { Suspense } from 'react';
import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import { createAdminClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetPageSkeleton from '@/components/fleet/FleetPageSkeleton';
import FleetPageHeader from '@/components/fleet/FleetPageHeader';
import FleetIcon from '@/components/fleet/FleetIcon';
import { ensureInvoiceSettings } from '@/lib/invoices/server';
import InvoiceSettingsForm, { type CategoryOption, type SellerDetails } from './InvoiceSettingsForm';
import styles from '../invoices.module.css';

type FleetUser = Awaited<ReturnType<typeof requireRole>>;

/** Numbering, VAT, payment terms and what is printed on every invoice. */
export default async function InvoiceSettingsPage() {
  const user = await requireRole(['admin']);
  await requireModule(user.organization_id, 'invoices');
  return (
    <FleetShell user={user} title="Invoice settings">
      <Suspense fallback={<FleetPageSkeleton variant="list" stats={0} />}>
        <SettingsContent user={user} />
      </Suspense>
    </FleetShell>
  );
}

async function SettingsContent({ user }: { user: FleetUser }) {
  const admin = createAdminClient();
  const orgId = user.organization_id;

  const [{ settings, error }, categories, org, lastUsed] = await Promise.all([
    ensureInvoiceSettings(admin, orgId),
    admin.from('org_finance_categories').select('id, name, kind, sort_order').eq('organization_id', orgId).eq('is_active', true).order('sort_order'),
    admin.from('organizations').select('name, legal_name, vat_number, contact_email, contact_phone, address').eq('id', orgId).maybeSingle(),
    admin.from('invoices').select('kind, number_seq').eq('organization_id', orgId).not('number_seq', 'is', null).order('number_seq', { ascending: false }).limit(2000),
  ]);

  const header = (
    <FleetPageHeader
      breadcrumb="Financial / Invoices / Settings"
      title="Invoice settings"
      action={
        <Link href="/fleet/invoices" className={styles.btn}>
          <FleetIcon name="chevron-left" size={15} />
          Invoices
        </Link>
      }
    />
  );

  if (error || !settings) {
    return (
      <div className={`${styles.page} ${styles.narrow}`}>
        {header}
        <div className={styles.notice} role="status">
          <FleetIcon name="info" size={16} />
          <span>{error ?? 'Invoice settings could not be loaded. Please try again.'}</span>
        </div>
      </div>
    );
  }

  const options = ((categories.data ?? []) as { id: string; name: string; kind: 'income' | 'expense' }[]).map(
    (c): CategoryOption => ({ id: c.id, name: c.name, kind: c.kind }),
  );
  const seller: SellerDetails = {
    name: (org.data?.legal_name as string | null)?.trim() || (org.data?.name as string | null) || user.organization_name,
    address: (org.data?.address as string | null) ?? null,
    vatNumber: (org.data?.vat_number as string | null) ?? null,
    email: (org.data?.contact_email as string | null) ?? null,
    phone: (org.data?.contact_phone as string | null) ?? null,
  };
  const maxSeq = (kind: string) =>
    Math.max(0, ...((lastUsed.data ?? []) as { kind: string; number_seq: number }[]).filter((r) => r.kind === kind).map((r) => Number(r.number_seq)));

  return (
    <div className={`${styles.page} ${styles.narrow}`}>
      {header}
      <InvoiceSettingsForm
        settings={settings}
        categories={options}
        seller={seller}
        lastInvoiceSeq={maxSeq('invoice')}
        lastCreditNoteSeq={maxSeq('credit_note')}
      />
    </div>
  );
}
