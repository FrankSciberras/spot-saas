import type { NextRequest } from 'next/server';
import { withApiAuth, readJsonBody, type ApiContext } from '@/lib/api/auth';
import { apiError, apiNoContent, apiSuccess } from '@/lib/api/respond';
import { createAdminClient } from '@/lib/supabase/server';
import { TRANSACTION_COLUMNS, serializeTransaction } from '@/lib/api/serializers';
import {
  TRANSACTION_WRITABLE_FIELDS,
  buildTransactionPayload,
  guardBookkeeping,
  loadCategoryMap,
  verifyTransactionLinks,
} from '@/lib/api/resources/transactions';
import { FieldErrors, isUuid, rejectUnknownFields } from '@/lib/api/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

/** GET /api/v1/financials/transactions/{id} */
export const GET = withApiAuth<RouteCtx>(
  'financials:read',
  async (_req: NextRequest, ctx: ApiContext, route: RouteCtx) => {
    const blocked = await guardBookkeeping(ctx.organizationId);
    if (blocked) return blocked;

    const { id } = await route.params;
    if (!isUuid(id)) return apiError('not_found', 'No transaction with that id.');

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('finance_transactions')
      .select(TRANSACTION_COLUMNS)
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();

    if (error) {
      console.error('[api/v1] get transaction failed:', error);
      return apiError('internal_error', 'Could not load the transaction.');
    }
    if (!data) return apiError('not_found', 'No transaction with that id.');

    const categories = await loadCategoryMap(admin, ctx.organizationId);
    return apiSuccess(serializeTransaction(data, categories));
  },
);

/**
 * PATCH /api/v1/financials/transactions/{id} — correct a line.
 *
 * Lines the app posted itself (`source: "recurring"`) are read-only here: they
 * are regenerated from the fleet's recurring-cost setup, so an edit would be
 * silently undone. Change the recurring cost in Rovora instead.
 */
export const PATCH = withApiAuth<RouteCtx>(
  'financials:write',
  async (req: NextRequest, ctx: ApiContext, route: RouteCtx) => {
    const blocked = await guardBookkeeping(ctx.organizationId);
    if (blocked) return blocked;

    const { id } = await route.params;
    if (!isUuid(id)) return apiError('not_found', 'No transaction with that id.');

    const parsed = await readJsonBody(req);
    if ('response' in parsed) return parsed.response;
    const body = parsed.value;

    const errs = new FieldErrors();
    rejectUnknownFields(errs, body, TRANSACTION_WRITABLE_FIELDS);
    const payload = buildTransactionPayload(errs, body);
    if (errs.any) return errs.response();

    if (Object.keys(payload).length === 0) {
      return apiError('validation_failed', 'Supply at least one field to update.');
    }
    if (payload.category_id === null) errs.add('category_id', 'must not be null');
    if (payload.amount === null) errs.add('amount', 'must not be null');
    if (payload.txn_date === null) errs.add('txn_date', 'must not be null');
    if (errs.any) return errs.response();

    const admin = createAdminClient();

    const { data: existing } = await admin
      .from('finance_transactions')
      .select('id, source')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();

    if (!existing) return apiError('not_found', 'No transaction with that id.');
    if (existing.source === 'recurring') {
      return apiError(
        'conflict',
        'This line was posted automatically from a recurring cost and cannot be edited through the API. Change the recurring cost in Rovora instead.',
      );
    }

    await verifyTransactionLinks(admin, ctx.organizationId, payload, errs);
    if (errs.any) return errs.response();

    payload.updated_at = new Date().toISOString();

    const { data, error } = await admin
      .from('finance_transactions')
      .update(payload)
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .select(TRANSACTION_COLUMNS)
      .maybeSingle();

    if (error) {
      console.error('[api/v1] update transaction failed:', error);
      return apiError('internal_error', 'Could not update the transaction.');
    }
    if (!data) return apiError('not_found', 'No transaction with that id.');

    const categories = await loadCategoryMap(admin, ctx.organizationId);
    return apiSuccess(serializeTransaction(data, categories));
  },
);

/**
 * DELETE /api/v1/financials/transactions/{id} — remove a line from the books.
 *
 * Automatically-posted recurring lines are protected here too: deleting one
 * would only bring it back on the next posting run.
 */
export const DELETE = withApiAuth<RouteCtx>(
  'financials:write',
  async (_req: NextRequest, ctx: ApiContext, route: RouteCtx) => {
    const blocked = await guardBookkeeping(ctx.organizationId);
    if (blocked) return blocked;

    const { id } = await route.params;
    if (!isUuid(id)) return apiError('not_found', 'No transaction with that id.');

    const admin = createAdminClient();
    const { data: existing } = await admin
      .from('finance_transactions')
      .select('id, source, receipt_path')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();

    if (!existing) return apiError('not_found', 'No transaction with that id.');
    if (existing.source === 'recurring') {
      return apiError(
        'conflict',
        'This line was posted automatically from a recurring cost. Stop or edit the recurring cost in Rovora instead.',
      );
    }

    const { error } = await admin
      .from('finance_transactions')
      .delete()
      .eq('id', id)
      .eq('organization_id', ctx.organizationId);

    if (error) {
      console.error('[api/v1] delete transaction failed:', error);
      return apiError('internal_error', 'Could not delete the transaction.');
    }

    // Take the receipt image with it — an orphaned private object is just a
    // storage bill nobody can reach.
    if (existing.receipt_path) {
      await admin.storage.from('documents').remove([String(existing.receipt_path)]).catch(() => undefined);
    }

    return apiNoContent();
  },
);
