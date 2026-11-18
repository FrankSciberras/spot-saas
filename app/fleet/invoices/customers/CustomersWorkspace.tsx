'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import FleetIcon from '@/components/fleet/FleetIcon';
import FleetPageHeader from '@/components/fleet/FleetPageHeader';
import { deleteCustomerAction, saveCustomerAction, setCustomerArchivedAction } from '@/lib/actions/invoices';
import type { InvoiceCustomer } from '@/lib/invoices/types';
import InvoiceDialog from '../InvoiceDialog';
import styles from '../invoices.module.css';

type Editing = { mode: 'new' } | { mode: 'edit'; customer: InvoiceCustomer } | null;

export default function CustomersWorkspace({
  customers,
  documentCounts,
  openNew,
}: {
  customers: InvoiceCustomer[];
  /** customer id → number of invoices and credit notes (drafts included). */
  documentCounts: Record<string, number>;
  /** Open the "new customer" dialog straight away (?new=1). */
  openNew: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(openNew ? { mode: 'new' } : null);
  const [deleting, setDeleting] = useState<InvoiceCustomer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const active = customers.filter((c) => !c.archived_at);
  const archived = customers.filter((c) => c.archived_at);

  const setArchived = (customer: InvoiceCustomer, value: boolean) =>
    startTransition(async () => {
      setError(null);
      const result = await setCustomerArchivedAction(customer.id, value);
      if (!result.ok) setError(result.error);
      router.refresh();
    });

  const onDelete = () =>
    startTransition(async () => {
      if (!deleting) return;
      setError(null);
      const result = await deleteCustomerAction(deleting.id);
      setDeleting(null);
      if (!result.ok) setError(result.error);
      router.refresh();
    });

  const row = (customer: InvoiceCustomer) => {
    const count = documentCounts[customer.id] ?? 0;
    const meta = [customer.email, customer.vat_number ? `VAT no. ${customer.vat_number}` : null, customer.address?.replace(/\s*\n\s*/g, ', ')]
      .filter(Boolean)
      .join(' · ');
    return (
      <div className={styles.customerRow} key={customer.id}>
        <div className={styles.customerMain}>
          <div className={styles.customerName}>{customer.name}</div>
          <div className={styles.customerMeta}>
            {meta || 'No contact details yet'}
            {' · '}
            {count === 0 ? 'No documents' : `${count} ${count === 1 ? 'document' : 'documents'}`}
          </div>
        </div>
        <div className={styles.customerActions}>
          {!customer.archived_at && (
            <Link href={`/fleet/invoices/new?customer=${customer.id}`} className={styles.iconBtn} aria-label={`New invoice for ${customer.name}`} title="New invoice">
              <FleetIcon name="plus" size={15} stroke={2} />
            </Link>
          )}
          <button type="button" className={styles.iconBtn} onClick={() => setEditing({ mode: 'edit', customer })} disabled={pending} aria-label={`Edit ${customer.name}`} title="Edit">
            <FleetIcon name="pencil" size={15} />
          </button>
          {customer.archived_at ? (
            <button type="button" className={styles.iconBtn} onClick={() => setArchived(customer, false)} disabled={pending} aria-label={`Restore ${customer.name}`} title="Restore">
              <FleetIcon name="refresh" size={15} />
            </button>
          ) : count > 0 ? (
            <button type="button" className={styles.iconBtn} onClick={() => setArchived(customer, true)} disabled={pending} aria-label={`Archive ${customer.name}`} title="Archive">
              <FleetIcon name="archive" size={15} />
            </button>
          ) : null}
          {count === 0 && (
            <button
              type="button"
              className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
              onClick={() => setDeleting(customer)}
              disabled={pending}
              aria-label={`Delete ${customer.name}`}
              title="Delete"
            >
              <FleetIcon name="trash" size={15} />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={`${styles.page} ${styles.narrow}`}>
      <FleetPageHeader
        breadcrumb="Financial / Invoices / Customers"
        title="Customers"
        count={active.length}
        action={
          <div className={styles.headActions}>
            <Link href="/fleet/invoices" className={styles.btn}>
              <FleetIcon name="chevron-left" size={15} />
              Invoices
            </Link>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setEditing({ mode: 'new' })}>
              <FleetIcon name="plus" size={15} stroke={2} />
              New customer
            </button>
          </div>
        }
      />

      {error && (
        <div className={`${styles.notice} ${styles.noticeError}`} role="alert" style={{ marginBottom: 14 }}>
          <FleetIcon name="warning" size={16} />
          <span>{error}</span>
        </div>
      )}

      {customers.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <FleetIcon name="staff" size={22} />
          </div>
          <h2>Add who you invoice</h2>
          <p>
            A customer is anyone you send an invoice to: a hotel, a company with an account, a partner fleet, a driver renting a car. Their name,
            address and VAT number are printed on every invoice you issue to them.
          </p>
          <div className={styles.emptyActions}>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => setEditing({ mode: 'new' })}>
              <FleetIcon name="plus" size={15} stroke={2} />
              New customer
            </button>
          </div>
        </div>
      ) : (
        <>
          {active.length > 0 ? (
            <div className={`${styles.panel} ${styles.panelFlush}`}>{active.map(row)}</div>
          ) : (
            <div className={`${styles.panel} ${styles.emptySmall}`}>Every customer is archived.</div>
          )}
          {archived.length > 0 && (
            <>
              <div className={styles.sectionLabel}>Archived</div>
              <div className={`${styles.panel} ${styles.panelFlush}`}>{archived.map(row)}</div>
              <p className={styles.fieldHint}>Archived customers are hidden when you write a new invoice. Their existing documents are untouched.</p>
            </>
          )}
        </>
      )}

      {editing && (
        <CustomerDialog
          customer={editing.mode === 'edit' ? editing.customer : null}
          hasDocuments={editing.mode === 'edit' && (documentCounts[editing.customer.id] ?? 0) > 0}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setError(null);
            router.refresh();
          }}
        />
      )}

      {deleting && (
        <InvoiceDialog
          title={`Delete ${deleting.name}?`}
          onClose={() => setDeleting(null)}
          busy={pending}
          footer={
            <>
              <button type="button" className={styles.btn} onClick={() => setDeleting(null)} disabled={pending}>
                Keep
              </button>
              <button type="button" className={`${styles.btn} ${styles.btnDangerSolid}`} onClick={onDelete} disabled={pending}>
                {pending ? 'Deleting…' : 'Delete customer'}
              </button>
            </>
          }
        >
          <p>This customer has no invoices or credit notes, so it can be removed completely.</p>
        </InvoiceDialog>
      )}
    </div>
  );
}

function CustomerDialog({
  customer,
  hasDocuments,
  onClose,
  onSaved,
}: {
  customer: InvoiceCustomer | null;
  hasDocuments: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(customer?.name ?? '');
  const [contact, setContact] = useState(customer?.contact_name ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [address, setAddress] = useState(customer?.address ?? '');
  const [vat, setVat] = useState(customer?.vat_number ?? '');
  const [notes, setNotes] = useState(customer?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await saveCustomerAction({
        id: customer?.id ?? null,
        name,
        contact_name: contact,
        email,
        phone,
        address,
        vat_number: vat,
        notes,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
    });

  return (
    <InvoiceDialog
      title={customer ? 'Edit customer' : 'New customer'}
      onClose={onClose}
      busy={pending}
      wide
      footer={
        <>
          <button type="button" className={styles.btn} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={submit} disabled={pending || !name.trim()}>
            {pending ? 'Saving…' : customer ? 'Save changes' : 'Add customer'}
          </button>
        </>
      }
    >
      <div className={styles.fields}>
        <label className={`${styles.field} ${styles.fieldWide}`}>
          <span className={styles.fieldLabel}>Name</span>
          <input className={styles.input} value={name} maxLength={200} autoFocus placeholder="Company or person, as it should appear on the invoice" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Contact person</span>
          <input className={styles.input} value={contact} maxLength={200} placeholder="Optional" onChange={(e) => setContact(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Email</span>
          <input className={styles.input} type="email" value={email} maxLength={200} placeholder="Where invoices are sent" onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Phone</span>
          <input className={styles.input} value={phone} maxLength={60} placeholder="Optional" onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>VAT number</span>
          <input className={styles.input} value={vat} maxLength={40} placeholder="Optional" onChange={(e) => setVat(e.target.value)} />
        </label>
        <label className={`${styles.field} ${styles.fieldWide}`}>
          <span className={styles.fieldLabel}>Address</span>
          <textarea className={styles.textarea} value={address} maxLength={600} placeholder="Street, town, postcode, country — printed as written" onChange={(e) => setAddress(e.target.value)} />
        </label>
        <label className={`${styles.field} ${styles.fieldWide}`}>
          <span className={styles.fieldLabel}>Notes</span>
          <textarea className={styles.textarea} value={notes} maxLength={2000} placeholder="Only you see these" onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      {hasDocuments && (
        <p className={styles.fieldHint}>
          Invoices already issued keep the name, address and VAT number they were issued with. Changes apply to new ones.
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </InvoiceDialog>
  );
}
