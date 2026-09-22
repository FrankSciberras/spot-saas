import type { NextRequest } from 'next/server';
import { withApiAuth, readJsonBody, type ApiContext } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/api/respond';
import { createAdminClient } from '@/lib/supabase/server';
import { TRANSACTION_COLUMNS, serializeTransaction } from '@/lib/api/serializers';
import {
  TRANSACTION_WRITABLE_FIELDS,
  buildTransactionPayload,
  guardBookkeeping,
  loadCategoryMap,
  verifyTransactionLinks,
} from '@/lib/api/resources/transactions';
import {
  FieldErrors,
  sanitizeSearchTerm,
  pageMeta,
  readPagination,
  rejectUnknownFields,
} from '@/lib/api/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SORTABLE = ['txn_date', 'amount', 'created_at'] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/v1/financials/transactions — the ledger, newest first.
 *
 * The books are a running list of dated lines, so every report is a date-range
 * query: `from` / `to` (inclusive, YYYY-MM-DD). Also filters on `category_id`,
 * `vehicle_id`, `driver_id`, `direction` (income|expense), `payment_method`
 * and `search` (description or counterparty).
 */
export const GET = withApiAuth('financials:read', async (req: NextRequest, ctx: ApiContext) => {
  const blocked = await guardBookkeeping(ctx.organizationId);
  if (blocked) return blocked;

  const url = new URL(req.url);
  const page = readPagination(url);
  const admin = createAdminClient();

  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  for (const [name, value] of [['from', from], ['to', to]] as const) {
    if (value && !DATE_RE.test(value)) {
      return apiError('validation_failed', `${name} must be a date in YYYY-MM-DD format.`);
    }
  }

  const direction = url.searchParams.get('direction');
  if (direction && direction !== 'income' && direction !== 'expense') {
    return apiError('validation_failed', 'direction must be "income" or "expense".');
  }

  // Direction lives on the category, so filtering by it means resolving the
  // fleet's categories of that kind first and filtering the ledger on those ids.
  let directionCategoryIds: string[] | null = null;
  if (direction) {
    const { data: cats } = await admin
      .from('org_finance_categories')
      .select('id')
      .eq('organization_id', ctx.organizationId)
      .eq('kind', direction);
    directionCategoryIds = (cats ?? []).map((c) => String(c.id));
    if (directionCategoryIds.length === 0) {
      return apiSuccess([], { meta: pageMeta(page, 0) });
    }
  }

  let query = admin
    .from('finance_transactions')
    .select(TRANSACTION_COLUMNS, { count: 'exact' })
    .eq('organization_id', ctx.organizationId);

  if (from) query = query.gte('txn_date', from);
  if (to) query = query.lte('txn_date', to);
  if (directionCategoryIds) query = query.in('category_id', directionCategoryIds);

  const categoryId = url.searchParams.get('category_id');
  if (categoryId) query = query.eq('category_id', categoryId);

  const vehicleId = url.searchParams.get('vehicle_id');
  if (vehicleId) query = query.eq('vehicle_id', vehicleId);

  const driverId = url.searchParams.get('driver_id');
  if (driverId) query = query.eq('driver_id', driverId);

  const paymentMethod = url.searchParams.get('payment_method');
  if (paymentMethod) query = query.eq('payment_method', paymentMethod);

  const search = sanitizeSearchTerm(url.searchParams.get('search') ?? '');
  if (search) {
    query = query.or(`description.ilike.%${search}%,counterparty.ilike.%${search}%`);
  }

  const sortParam = url.searchParams.get('sort') ?? '-txn_date';
  const desc = sortParam.startsWith('-');
  const sortField = desc ? sortParam.slice(1) : sortParam;
  if (!(SORTABLE as readonly string[]).includes(sortField)) {
    return apiError('validation_failed', `sort must be one of: ${SORTABLE.join(', ')} (prefix with "-" to reverse).`);
  }

  const { data, error, count } = await query
    .order(sortField, { ascending: !desc })
    .range(page.offset, page.offset + page.limit - 1);

  if (error) {
    console.error('[api/v1] list transactions failed:', error);
    return apiError('internal_error', 'Could not load transactions.');
  }

  const categories = await loadCategoryMap(admin, ctx.organizationId);
  return apiSuccess(
    (data ?? []).map((row) => serializeTransaction(row, categories)),
    { meta: pageMeta(page, count) },
  );
});

/**
 * POST /api/v1/financials/transactions — record one income or expense line.
 *
 * `amount` is always POSITIVE. Whether the line adds to income or to costs is
 * decided by the category's `kind`, so there is no way to file an expense that
 * accidentally counts as revenue.
 *
 * Lines created here are marked `source: "manual"` — the same as one typed into
 * the dashboard — and appear immediately in the fleet's financial reports.
 */
export const POST = withApiAuth('financials:write', async (req: NextRequest, ctx: ApiContext) => {
  const blocked = await guardBookkeeping(ctx.organizationId);
  if (blocked) return blocked;

  const parsed = await readJsonBody(req);
  if ('response' in parsed) return parsed.response;
  const body = parsed.value;

  const errs = new FieldErrors();
  rejectUnknownFields(errs, body, TRANSACTION_WRITABLE_FIELDS);
  const payload = buildTransactionPayload(errs, body);

  if (payload.category_id === undefined || payload.category_id === null) {
    errs.add('category_id', 'is required');
  }
  if (payload.amount === undefined || payload.amount === null) {
    errs.add('amount', 'is required');
  }
  if (errs.any) return errs.response();

  const admin = createAdminClient();
  await verifyTransactionLinks(admin, ctx.organizationId, payload, errs);
  if (errs.any) return errs.response();

  const { data, error } = await admin
    .from('finance_transactions')
    .insert({
      ...payload,
      organization_id: ctx.organizationId,
      // Default to today so a simple "log this expense" call needs no date.
      txn_date: payload.txn_date ?? new Date().toISOString().slice(0, 10),
      payment_method: payload.payment_method ?? 'card',
      source: 'manual',
    })
    .select(TRANSACTION_COLUMNS)
    .single();

  if (error) {
    console.error('[api/v1] create transaction failed:', error);
    return apiError('internal_error', 'Could not record the transaction.');
  }

  const categories = await loadCategoryMap(admin, ctx.organizationId);
  return apiSuccess(serializeTransaction(data, categories), { status: 201 });
});
