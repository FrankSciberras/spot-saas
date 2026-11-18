import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/server';
import { createAuditLogEntry, getAuditActor } from '@/lib/audit/log';
import { sealSecret } from '@/lib/crypto/secret-box';
import { appUrl } from '@/lib/urls';
import { XeroHttpApi, exchangeCode, listConnections } from '@/lib/xero/client';
import { XERO_STATE_COOKIE, readOauthState } from '@/lib/xero/oauth-state';
import { isXeroNotInstalled, loadXeroConnection } from '@/lib/xero/sync';
import { DEFAULT_XERO_SETTINGS, XeroError, normaliseXeroSettings } from '@/lib/xero/types';
import { invoiceToday } from '@/lib/invoices/server';

/**
 * GET /api/xero/callback?code=…&state=…
 * Xero sends the admin back here after they approve (or refuse) the
 * connection. Exchanges the one-time code for tokens, finds out which Xero
 * organisation was chosen, and stores the connection for the fleet that
 * started the sign-in.
 */
export const dynamic = 'force-dynamic';

function finish(params: string) {
  const response = NextResponse.redirect(`${appUrl()}/fleet/xero${params}`);
  response.cookies.set(XERO_STATE_COOKIE, '', { path: '/api/xero', maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const user = await getSession();
  if (!user) return NextResponse.redirect(`${appUrl()}/login`);

  // The admin pressed "Cancel" at Xero, or Xero reported a problem.
  if (url.searchParams.get('error')) {
    return finish(`?error=${url.searchParams.get('error') === 'access_denied' ? 'denied' : 'xero'}`);
  }

  const started = readOauthState(request.cookies.get(XERO_STATE_COOKIE)?.value, url.searchParams.get('state'));
  const code = url.searchParams.get('code');
  if (!started || !code) return finish('?error=state');
  // Still the same person, still an admin, still in the fleet they started from.
  if (started.user !== user.id || started.org !== user.organization_id || user.role !== 'admin') {
    return finish('?error=state');
  }
  const orgId = user.organization_id;

  try {
    const tokens = await exchangeCode(code);

    // Which organisation did they pick? Prefer the one approved in THIS sign-in.
    const connections = (await listConnections(tokens.accessToken)).filter((c) => c.tenantType === 'ORGANISATION' && c.tenantId);
    const chosen = connections.find((c) => tokens.authEventId && c.authEventId === tokens.authEventId) ?? connections[0];
    if (!chosen) return finish('?error=no_org');

    const api = new XeroHttpApi(chosen.tenantId, async () => tokens.accessToken);
    const organisation = await api.getOrganisation();

    const admin = createAdminClient();
    const existing = await loadXeroConnection(admin, orgId);
    const sameTenant = existing?.tenant_id === chosen.tenantId;
    // Reconnecting the same organisation keeps the admin's mapping. A different
    // organisation has different accounts and tax rates: start from defaults.
    const settings = sameTenant
      ? normaliseXeroSettings(existing?.settings)
      : { ...DEFAULT_XERO_SETTINGS, sync_from: invoiceToday() };

    const { error } = await admin.from('xero_connections').upsert(
      {
        organization_id: orgId,
        tenant_id: chosen.tenantId,
        tenant_name: organisation.Name || chosen.tenantName,
        connection_id: chosen.id || null,
        org_base_currency: organisation.BaseCurrency || null,
        org_country: organisation.CountryCode || null,
        org_short_code: organisation.ShortCode,
        access_token_enc: sealSecret(tokens.accessToken),
        refresh_token_enc: sealSecret(tokens.refreshToken),
        access_expires_at: tokens.expiresAt.toISOString(),
        token_version: (existing?.token_version ?? 0) + 1,
        scopes: tokens.scopes,
        status: 'connected',
        last_error: null,
        settings,
        sync_started_at: null,
        connected_by: user.id,
      },
      { onConflict: 'organization_id' },
    );
    if (error) {
      console.error('xero callback: saving the connection failed:', error);
      return finish(`?error=${isXeroNotInstalled(error) ? 'not_installed' : 'save'}`);
    }

    // "Xero" in the sidebar for this fleet.
    await admin
      .from('org_modules')
      .upsert({ organization_id: orgId, module_key: 'xero', is_enabled: true }, { onConflict: 'organization_id,module_key' });

    await createAuditLogEntry({
      actor: await getAuditActor(user.id),
      organizationId: orgId,
      action: existing ? 'update' : 'create',
      entityType: 'xero_connection',
      entityId: chosen.tenantId,
      summary: `${existing ? 'Reconnected' : 'Connected'} Xero (${organisation.Name || chosen.tenantName || 'organisation'})`,
      details: { tenant_id: chosen.tenantId, base_currency: organisation.BaseCurrency },
    });

    return finish(`?connected=${sameTenant ? 'again' : 'new'}`);
  } catch (error) {
    if (!(error instanceof XeroError)) console.error('xero callback: unexpected error:', error);
    const kind = error instanceof XeroError ? error.kind : 'unknown';
    return finish(`?error=${kind === 'config' ? 'not_configured' : kind === 'transient' ? 'unreachable' : 'xero'}`);
  }
}
