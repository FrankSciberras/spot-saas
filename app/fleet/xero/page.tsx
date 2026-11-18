import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetIcon from '@/components/fleet/FleetIcon';
import { isXeroConfigured } from '@/lib/xero/client';
import { connectionSettings, loadXeroConnection, xeroApiFor } from '@/lib/xero/sync';
import { xeroLink } from '@/lib/xero/mapping';
import { XeroError, taxRateKey, type SyncItem } from '@/lib/xero/types';
import { shapeReferenceData, type XeroReferenceData } from '@/lib/xero/reference';
import XeroControls from './XeroControls';
import XeroSetup from './XeroSetup';
import XeroActivity, { type ActivityRow } from './XeroActivity';
import styles from './xero.module.css';

// =============================================================================
// XERO — connect a fleet's Xero organisation and choose what is sent to it.
// Not module-guarded: it has to stay reachable so a fleet can connect in the
// first place (same as /fleet/bolt). Admins only.
// =============================================================================

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  denied: 'You cancelled at Xero, so nothing was connected.',
  state: 'That sign-in could not be matched to this session. Please start again from here.',
  no_org: 'No Xero organisation was selected. Start again and choose the organisation to connect.',
  not_configured: 'The Xero integration isn’t available on this workspace yet.',
  not_installed: 'The Xero integration isn’t switched on for this workspace yet. Please contact support.',
  not_admin: 'Only a fleet admin can connect Xero.',
  unreachable: 'Xero could not be reached. Please try again in a moment.',
  save: 'The connection could not be saved. Please try again.',
  xero: 'Xero refused the connection. Please try again.',
};

function XeroMark({ size = 26 }: { size?: number }) {
  return (
    <span className={styles.mark} style={{ width: size + 18, height: size + 18, fontSize: size * 0.62 }} aria-hidden>
      x
    </span>
  );
}

function when(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: process.env.NEXT_PUBLIC_TIME_ZONE || 'Europe/Malta',
  });
}

export default async function XeroPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole(['admin']);
  const params = await searchParams;
  const errorKey = typeof params.error === 'string' ? params.error : null;
  const connected = typeof params.connected === 'string' ? params.connected : null;
  const orgId = user.organization_id;
  const admin = createAdminClient();

  const configured = isXeroConfigured();
  const conn = configured ? await loadXeroConnection(admin, orgId) : null;

  const header = (
    <div className={`${styles.header} header-mobile-row`}>
      <div>
        <div className={styles.breadcrumb}>Financial / Xero</div>
        <h1 className={styles.title}>Xero</h1>
        <p className={styles.subtitle}>Send your invoices, credit notes and payments to your accountant’s books as they happen.</p>
      </div>
    </div>
  );

  if (!configured) {
    return (
      <FleetShell user={user} title="Xero">
        <div className={styles.container}>
          {header}
          <div className={styles.notice}>
            <FleetIcon name="info" size={16} />
            <div>
              <strong>Xero isn’t available on this workspace yet.</strong>
              <p>The connection to Xero has to be switched on by Rovora first. Until then, the Xero and QuickBooks file export on the Financials page works as before.</p>
              <Link href="/fleet/financials" className={styles.link}>Open Financials</Link>
            </div>
          </div>
        </div>
      </FleetShell>
    );
  }

  if (!conn) {
    return (
      <FleetShell user={user} title="Xero">
        <div className={styles.container}>
          {header}
          {errorKey && <div className={styles.error} role="alert">{ERRORS[errorKey] ?? ERRORS.xero}</div>}
          <div className={styles.connectCard}>
            <div className={styles.connectHead}>
              <XeroMark />
              <div>
                <h2 className={styles.connectTitle}>Connect your Xero organisation</h2>
                <p className={styles.connectLead}>
                  You sign in to Xero and approve Rovora. From then on, every invoice and credit note you issue here is created in Xero within seconds, with the same number, customer, lines and VAT.
                </p>
              </div>
            </div>
            <ul className={styles.points}>
              <li><FleetIcon name="check" size={14} stroke={2.2} /> Invoices and credit notes, as approved documents</li>
              <li><FleetIcon name="check" size={14} stroke={2.2} /> Payments and refunds, if you choose (you pick the bank account)</li>
              <li><FleetIcon name="check" size={14} stroke={2.2} /> Bookkeeping expenses and income, if you choose (you pick the account per category)</li>
              <li><FleetIcon name="check" size={14} stroke={2.2} /> Only what is dated from today on, unless you pick an earlier start date</li>
            </ul>
            <p className={styles.hint}>
              <FleetIcon name="lock" size={12} stroke={1.8} /> One-way: Rovora adds to Xero and never reads your accounts back. It only ever changes records it created itself. You can disconnect at any time.
            </p>
            <a className="btn btn-primary" href="/api/xero/connect">Connect to Xero</a>
          </div>
        </div>
      </FleetShell>
    );
  }

  // ── Connected ──
  const settings = connectionSettings(conn);

  let reference: XeroReferenceData | null = null;
  let referenceError: string | null = null;
  if (conn.status === 'connected') {
    try {
      const api = xeroApiFor(admin, conn);
      const [accounts, taxRates] = await Promise.all([api.getAccounts(), api.getTaxRates()]);
      reference = shapeReferenceData(accounts, taxRates);
    } catch (error) {
      referenceError = error instanceof XeroError ? error.message : 'Your Xero accounts could not be loaded. Reload the page to try again.';
    }
  }

  const [linesRes, invoiceSettingsRes, categoriesRes, itemsRes] = await Promise.all([
    admin.from('invoice_lines').select('tax_rate').eq('organization_id', orgId).limit(5000),
    admin.from('invoice_settings').select('default_tax_rate').eq('organization_id', orgId).maybeSingle(),
    admin.from('org_finance_categories').select('id, name, kind, is_active').eq('organization_id', orgId).order('kind').order('sort_order'),
    admin
      .from('xero_sync_items')
      .select('entity_type, entity_id, xero_id, status, remote_state, attempts, last_error, last_attempt_at, synced_at, label, amount')
      .eq('organization_id', orgId)
      .eq('tenant_id', conn.tenant_id)
      .order('last_attempt_at', { ascending: false, nullsFirst: false })
      .limit(300),
  ]);

  const ratesInUse = new Set<string>([taxRateKey(Number(invoiceSettingsRes.data?.default_tax_rate ?? 18))]);
  for (const row of linesRes.data ?? []) ratesInUse.add(taxRateKey(Number(row.tax_rate)));
  for (const key of Object.keys(settings.tax_types)) ratesInUse.add(key);

  const items = (itemsRes.data ?? []) as SyncItem[];
  const visible = items.filter((i) => i.entity_type !== 'contact' || i.status === 'error');
  const counts = {
    synced: visible.filter((i) => i.status === 'synced').length,
    waiting: visible.filter((i) => i.status === 'pending').length,
    failed: visible.filter((i) => i.status === 'error').length,
  };
  const rows: ActivityRow[] = visible.slice(0, 120).map((i) => ({
    entityType: i.entity_type,
    entityId: i.entity_id,
    label: i.label ?? '—',
    amount: i.amount === null ? null : Number(i.amount),
    status: i.status,
    remoteState: i.remote_state,
    message: i.last_error,
    when: i.synced_at ?? i.last_attempt_at,
    rovoraHref: i.entity_type === 'invoice' || i.entity_type === 'credit_note' ? `/fleet/invoices/${i.entity_id}` : i.entity_type === 'bank_transaction' ? '/fleet/earnings' : null,
    xeroHref:
      i.xero_id && i.remote_state !== 'none' && (i.entity_type === 'invoice' || i.entity_type === 'credit_note' || i.entity_type === 'bank_transaction')
        ? xeroLink(conn.org_short_code, i.entity_type, i.xero_id)
        : null,
  }));

  const needsReconnect = conn.status === 'needs_reconnect';

  return (
    <FleetShell user={user} title="Xero">
      <div className={styles.container}>
        {header}

        {errorKey && <div className={styles.error} role="alert">{ERRORS[errorKey] ?? ERRORS.xero}</div>}
        {connected && !errorKey && (
          <div className={styles.success} role="status">
            {connected === 'again'
              ? 'Xero is connected again. Your choices were kept and sending carries on where it left off.'
              : 'Xero is connected. Choose your accounts below — nothing is sent until you have.'}
          </div>
        )}

        <div className={styles.connStrip} data-status={conn.status}>
          <XeroMark size={22} />
          <div className={styles.connInfo}>
            <div className={styles.connName}>{conn.tenant_name ?? 'Xero organisation'}</div>
            <div className={styles.connMeta}>
              {needsReconnect ? <span className={styles.chipBad}>Needs reconnecting</span> : <span className={styles.chipOk}>Connected</span>}
              <span>Last sent {when(conn.last_synced_at)}</span>
              {conn.org_base_currency && <span>Base currency {conn.org_base_currency}</span>}
              {!settings.auto_sync && <span>Automatic sending is off</span>}
            </div>
          </div>
          <XeroControls needsReconnect={needsReconnect} tenantName={conn.tenant_name ?? 'Xero'} />
        </div>

        {needsReconnect && (
          <div className={styles.error} role="alert">
            <strong>Xero needs to be connected again.</strong> {conn.last_error ?? 'Xero stopped accepting the saved sign-in.'} Nothing is lost: press “Reconnect”, sign in to Xero, and sending carries on where it left off.
          </div>
        )}
        {!needsReconnect && conn.last_error && <div className={styles.warn}>{conn.last_error}</div>}

        <div className={styles.tiles}>
          <div className={styles.tile}><span className={styles.tileNum}>{counts.synced}</span><span className={styles.tileLbl}>in Xero</span></div>
          <div className={styles.tile} data-tone={counts.waiting > 0 ? 'warn' : undefined}><span className={styles.tileNum}>{counts.waiting}</span><span className={styles.tileLbl}>waiting</span></div>
          <div className={styles.tile} data-tone={counts.failed > 0 ? 'bad' : undefined}><span className={styles.tileNum}>{counts.failed}</span><span className={styles.tileLbl}>refused by Xero</span></div>
        </div>

        {referenceError && <div className={styles.warn}>{referenceError}</div>}
        {reference && (
          <XeroSetup
            settings={settings}
            reference={reference}
            ratesInUse={[...ratesInUse].sort((a, b) => Number(b) - Number(a))}
            categories={(categoriesRes.data ?? []).filter((c) => c.is_active || settings.category_accounts[c.id as string]).map((c) => ({ id: c.id as string, name: c.name as string, kind: c.kind as 'income' | 'expense' }))}
            baseCurrency={conn.org_base_currency}
          />
        )}

        <XeroActivity rows={rows} />
      </div>
    </FleetShell>
  );
}
