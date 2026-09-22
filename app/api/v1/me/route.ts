import type { NextRequest } from 'next/server';
import { withApiAuth } from '@/lib/api/auth';
import { apiSuccess } from '@/lib/api/respond';
import { createAdminClient } from '@/lib/supabase/server';
import { getApiEnabledModules } from '@/lib/api/entitlements';
import type { ApiContext } from '@/lib/api/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/me
 *
 * "Who am I and what may I do?" — the first call an integrator makes. Callable
 * by any live key regardless of scope, because its whole job is to report which
 * scopes the key holds. Returns no fleet data beyond the fleet's own name.
 */
export const GET = withApiAuth(null, async (_req: NextRequest, ctx: ApiContext) => {
  const admin = createAdminClient();

  const [orgRes, keyRes, modules] = await Promise.all([
    admin.from('organizations').select('id, name, slug').eq('id', ctx.organizationId).maybeSingle(),
    admin
      .from('api_keys')
      .select('id, name, key_prefix, created_at, expires_at, last_used_at')
      .eq('id', ctx.keyId)
      .maybeSingle(),
    getApiEnabledModules(ctx.organizationId),
  ]);

  const org = orgRes.data as { id: string; name: string; slug: string } | null;
  const key = keyRes.data as {
    id: string;
    name: string;
    key_prefix: string;
    created_at: string;
    expires_at: string | null;
    last_used_at: string | null;
  } | null;

  return apiSuccess({
    organization: org ? { id: org.id, name: org.name, slug: org.slug } : null,
    plan: { key: ctx.planKey, name: ctx.planName },
    key: key
      ? {
          id: key.id,
          name: key.name,
          prefix: key.key_prefix,
          created_at: key.created_at,
          expires_at: key.expires_at,
          last_used_at: key.last_used_at,
        }
      : null,
    scopes: ctx.scopes,
    // Which product modules are switched on. A disabled module's endpoints
    // answer 403 module_disabled, so a client can check here first.
    enabled_modules: Array.from(modules).sort(),
    rate_limit: {
      per_minute: ctx.rateHeaders['X-RateLimit-Limit'],
      per_day: ctx.rateHeaders['X-RateLimit-Limit-Day'],
    },
  });
});
