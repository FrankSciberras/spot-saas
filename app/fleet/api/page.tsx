import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/server';
import { getApiEntitlement } from '@/lib/api/entitlements';
import FleetShell from '@/components/fleet/FleetShell';
import FleetIcon from '@/components/fleet/FleetIcon';
import ApiKeysManager, { type ApiKeyRow, type LogRow } from './ApiKeysManager';
import styles from './api-keys.module.css';

export const dynamic = 'force-dynamic';

/**
 * Admin → API. Where a fleet creates and revokes the bearer keys that
 * authenticate /api/v1 calls, and sees how each one is being used.
 *
 * Access is a paid-tier benefit (plans.api_enabled), so fleets on a tier
 * without it get the upgrade panel instead of the key list.
 */
export default async function FleetApiPage() {
  const user = await requireRole(['admin']);
  const orgId = user.organization_id;

  const entitlement = await getApiEntitlement(orgId);

  // Deliberately column-explicit: key_hash must never leave the database, even
  // though it is only a hash.
  const admin = createAdminClient();
  const { data } = await admin
    .from('api_keys')
    .select(
      'id, name, key_prefix, scopes, allowed_ips, expires_at, revoked_at, last_used_at, last_used_ip, request_count, created_at',
    )
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  const keys = ((data as ApiKeyRow[] | null) ?? []).map((k) => ({
    ...k,
    scopes: k.scopes ?? [],
    allowed_ips: k.allowed_ips ?? [],
    request_count: Number(k.request_count ?? 0),
  }));

  // Recent calls, so an integrator can see what their key is actually doing
  // without leaving Rovora.
  const { data: logs } = await admin
    .from('api_request_logs')
    .select('id, method, path, status, duration_ms, error_code, created_at, key_id')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(25);

  return (
    <FleetShell user={user} title="API">
      <div className={styles.container}>
        <div className={`${styles.header} header-mobile-row`}>
          <div>
            <div className={styles.breadcrumb}>Admin / API</div>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>API</h1>
            </div>
            <p className={styles.subtitle}>
              Connect your own systems to Rovora. Read and write drivers, vehicles and financials
              from anywhere.
            </p>
          </div>
          <a className={styles.docsBtn} href="/docs/api" target="_blank" rel="noopener noreferrer">
            <FleetIcon name="doc" size={15} stroke={1.7} />
            Read the docs
          </a>
        </div>

        {entitlement.enabled ? (
          <ApiKeysManager
            keys={keys}
            logs={(logs ?? []) as LogRow[]}
            maxKeys={entitlement.maxKeys}
            perMinute={entitlement.perMinute}
            perDay={entitlement.perDay}
            planName={entitlement.planName}
          />
        ) : (
          <div className={styles.upsell}>
            <div className={styles.upsellIcon} aria-hidden>
              <FleetIcon name="plug" size={22} stroke={1.7} />
            </div>
            <h2 className={styles.upsellTitle}>The API isn&rsquo;t included in your plan</h2>
            <p className={styles.upsellBody}>
              {entitlement.reason === 'account_suspended'
                ? 'This account isn’t active at the moment. Get in touch and we’ll sort it out.'
                : entitlement.reason === 'trial_expired'
                  ? 'Your free trial has ended. Choose a plan to switch the API back on.'
                  : `You're on ${entitlement.planName}.${
                      entitlement.lowestApiPlanName
                        ? ` The API is available from ${entitlement.lowestApiPlanName} upwards — it lets your own systems read and write drivers, vehicles and financials directly.`
                        : ''
                    }`}
            </p>
            <div className={styles.upsellActions}>
              <Link className={styles.upsellPrimary} href="/billing">
                See plans
              </Link>
              <a className={styles.upsellGhost} href="/docs/api" target="_blank" rel="noopener noreferrer">
                What the API can do
              </a>
            </div>
          </div>
        )}
      </div>
    </FleetShell>
  );
}
