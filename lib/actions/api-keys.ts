'use server';

// =============================================================================
// API KEY ACTIONS (fleet admin only)
// =============================================================================
// Creating, renaming and revoking the bearer credentials that authenticate
// /api/v1 calls. Every action re-checks the ADMIN role for the caller's ACTIVE
// fleet and writes with the service-role client scoped to that organization_id
// — a staff member or a driver can never mint a key, and an admin of fleet A
// can never touch fleet B's keys.
//
// The plaintext secret exists for exactly one turn: it is returned from
// createApiKeyAction so the UI can show it once, and only its SHA-256 hash
// reaches the database. There is deliberately no "reveal" action — if a key is
// lost it gets revoked and replaced.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import { createAuditLogEntry, getAuditActor } from '@/lib/audit/log';
import { generateApiKey } from '@/lib/api/keys';
import { sanitizeScopes } from '@/lib/api/scopes';
import { getApiEntitlement } from '@/lib/api/entitlements';

export interface ApiKeySummary {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  allowed_ips: string[];
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  request_count: number;
  created_at: string;
}

type Result<T = undefined> = { error?: string; ok?: boolean; data?: T };

/** IPv4 / IPv6 literal. Deliberately strict: a wildcard here is a false sense of security. */
const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-fA-F:]{2,45}$/;

/**
 * Creates a key and returns the plaintext secret ONCE. The caller must show it
 * immediately — it cannot be retrieved again.
 */
export async function createApiKeyAction(input: {
  name: string;
  scopes: string[];
  allowedIps?: string[];
  expiresAt?: string | null;
  rateLimitPerMin?: number | null;
}): Promise<Result<{ id: string; secret: string; prefix: string }>> {
  const user = await requireRole(['admin']);
  const orgId = user.organization_id;

  const name = input.name?.trim();
  if (!name) return { error: 'Give the key a name so you can recognise it later.' };
  if (name.length > 80) return { error: 'That name is too long (80 characters max).' };

  const scopes = sanitizeScopes(input.scopes);
  if (scopes.length === 0) return { error: 'Choose at least one permission for this key.' };

  const allowedIps = (input.allowedIps ?? []).map((ip) => ip.trim()).filter(Boolean);
  for (const ip of allowedIps) {
    if (!IP_RE.test(ip)) return { error: `"${ip}" is not a valid IP address.` };
  }
  if (allowedIps.length > 20) return { error: 'An IP allow-list can hold at most 20 addresses.' };

  let expiresAt: string | null = null;
  if (input.expiresAt) {
    const parsed = new Date(input.expiresAt);
    if (Number.isNaN(parsed.getTime())) return { error: 'That expiry date is not valid.' };
    if (parsed <= new Date()) return { error: 'The expiry date must be in the future.' };
    expiresAt = parsed.toISOString();
  }

  // The plan decides whether this fleet may have keys at all, and how many.
  const ent = await getApiEntitlement(orgId);
  if (!ent.enabled) {
    return {
      error:
        ent.reason === 'account_suspended'
          ? 'This account is not active. Contact support.'
          : ent.reason === 'trial_expired'
            ? 'Your free trial has ended. Choose a plan to use the API.'
            : `The API isn’t included in your ${ent.planName} plan.${ent.lowestApiPlanName ? ` Upgrade to ${ent.lowestApiPlanName} or higher to enable it.` : ''}`,
    };
  }

  const admin = createAdminClient();

  const { count } = await admin
    .from('api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .is('revoked_at', null);

  if (ent.maxKeys > 0 && (count ?? 0) >= ent.maxKeys) {
    return {
      error: `Your ${ent.planName} plan allows ${ent.maxKeys} active API key${ent.maxKeys === 1 ? '' : 's'}. Revoke one before creating another.`,
    };
  }

  const generated = generateApiKey();

  const { data, error } = await admin
    .from('api_keys')
    .insert({
      organization_id: orgId,
      name,
      key_prefix: generated.prefix,
      key_hash: generated.hash,
      scopes,
      allowed_ips: allowedIps,
      expires_at: expiresAt,
      rate_limit_per_min: input.rateLimitPerMin ?? null,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error) {
    console.error('createApiKeyAction failed:', error);
    return { error: 'Could not create the key. Please try again.' };
  }

  await createAuditLogEntry({
    actor: await getAuditActor(user.id),
    organizationId: orgId,
    action: 'create',
    entityType: 'api_key',
    entityId: data.id,
    summary: `Created API key "${name}" (${generated.prefix}…)`,
    details: { scopes, expires_at: expiresAt, allowed_ips: allowedIps },
  });

  revalidatePath('/fleet/api');
  return { ok: true, data: { id: data.id, secret: generated.secret, prefix: generated.prefix } };
}

/** Revokes a key immediately. Irreversible — the key can never be un-revoked. */
export async function revokeApiKeyAction(keyId: string): Promise<Result> {
  const user = await requireRole(['admin']);
  const admin = createAdminClient();

  // Scoped by organization_id so an admin can only revoke their own fleet's keys.
  const { data, error } = await admin
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('organization_id', user.organization_id)
    .is('revoked_at', null)
    .select('id, name, key_prefix')
    .maybeSingle();

  if (error) {
    console.error('revokeApiKeyAction failed:', error);
    return { error: 'Could not revoke the key. Please try again.' };
  }
  if (!data) return { error: 'That key no longer exists.' };

  await createAuditLogEntry({
    actor: await getAuditActor(user.id),
    organizationId: user.organization_id,
    action: 'update',
    entityType: 'api_key',
    entityId: keyId,
    summary: `Revoked API key "${data.name}" (${data.key_prefix}…)`,
  });

  revalidatePath('/fleet/api');
  return { ok: true };
}

/** Renames a key. Scopes are intentionally immutable — make a new key instead. */
export async function renameApiKeyAction(keyId: string, name: string): Promise<Result> {
  const user = await requireRole(['admin']);
  const trimmed = name?.trim();
  if (!trimmed) return { error: 'Give the key a name.' };
  if (trimmed.length > 80) return { error: 'That name is too long (80 characters max).' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('api_keys')
    .update({ name: trimmed })
    .eq('id', keyId)
    .eq('organization_id', user.organization_id);

  if (error) {
    console.error('renameApiKeyAction failed:', error);
    return { error: 'Could not rename the key. Please try again.' };
  }

  revalidatePath('/fleet/api');
  return { ok: true };
}

/** Permanently deletes a REVOKED key row, to tidy the list. */
export async function deleteApiKeyAction(keyId: string): Promise<Result> {
  const user = await requireRole(['admin']);
  const admin = createAdminClient();

  // Only revoked keys can be removed: deleting a live key would silently break
  // whatever is calling with it, with no trace left of what happened.
  const { data, error } = await admin
    .from('api_keys')
    .delete()
    .eq('id', keyId)
    .eq('organization_id', user.organization_id)
    .not('revoked_at', 'is', null)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('deleteApiKeyAction failed:', error);
    return { error: 'Could not remove the key. Please try again.' };
  }
  if (!data) return { error: 'Revoke the key before removing it.' };

  revalidatePath('/fleet/api');
  return { ok: true };
}
