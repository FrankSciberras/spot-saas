import type { NextRequest } from 'next/server';
import { withApiAuth, type ApiContext } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/api/respond';
import { createAdminClient } from '@/lib/supabase/server';
import { CATEGORY_COLUMNS, serializeCategory } from '@/lib/api/serializers';
import { guardBookkeeping } from '@/lib/api/resources/transactions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/financials/categories — the fleet's chart of accounts.
 *
 * Every transaction needs a `category_id`, and a category's `kind` is what
 * makes a line income or expense. Read this once, cache the ids, and you can
 * post transactions without a lookup per call.
 *
 * `?include_inactive=true` also returns retired categories, which is what you
 * want when labelling historical transactions.
 */
export const GET = withApiAuth('financials:read', async (req: NextRequest, ctx: ApiContext) => {
  const blocked = await guardBookkeeping(ctx.organizationId);
  if (blocked) return blocked;

  const url = new URL(req.url);
  const includeInactive = url.searchParams.get('include_inactive') === 'true';
  const kind = url.searchParams.get('kind');
  if (kind && kind !== 'income' && kind !== 'expense') {
    return apiError('validation_failed', 'kind must be "income" or "expense".');
  }

  const admin = createAdminClient();
  let query = admin
    .from('org_finance_categories')
    .select(CATEGORY_COLUMNS)
    .eq('organization_id', ctx.organizationId);

  if (!includeInactive) query = query.eq('is_active', true);
  if (kind) query = query.eq('kind', kind);

  const { data, error } = await query.order('sort_order', { ascending: true });

  if (error) {
    console.error('[api/v1] list categories failed:', error);
    return apiError('internal_error', 'Could not load finance categories.');
  }

  return apiSuccess((data ?? []).map(serializeCategory));
});
