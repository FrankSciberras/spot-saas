import type { NextRequest } from 'next/server';
import { withApiAuth, type ApiContext } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/api/respond';
import { createAdminClient } from '@/lib/supabase/server';
import { guardBookkeeping, loadCategoryMap } from '@/lib/api/resources/transactions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Guard-rail: a summary is a report, not a full ledger export. */
const MAX_ROWS = 20_000;

interface Row {
  amount: number | string;
  category_id: string;
}

/**
 * GET /api/v1/financials/summary?from=…&to=…
 *
 * Income, expenses and net profit for any date range, with a per-category
 * breakdown. This is the endpoint to point a dashboard or a spreadsheet at:
 * one call replaces paging the whole ledger and adding it up client-side.
 *
 * The range is inclusive and both bounds are required, because "all time"
 * totals on a growing ledger get slower every month and are almost never what
 * the caller actually wants. A 4-week pay cycle, a month, a quarter — pass the
 * dates you care about.
 */
export const GET = withApiAuth('financials:read', async (req: NextRequest, ctx: ApiContext) => {
  const blocked = await guardBookkeeping(ctx.organizationId);
  if (blocked) return blocked;

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  if (!from || !to) {
    return apiError('validation_failed', 'Both "from" and "to" are required (YYYY-MM-DD).');
  }
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return apiError('validation_failed', 'from and to must be dates in YYYY-MM-DD format.');
  }
  if (from > to) {
    return apiError('validation_failed', '"from" must not be later than "to".');
  }

  const admin = createAdminClient();

  let query = admin
    .from('finance_transactions')
    .select('amount, category_id')
    .eq('organization_id', ctx.organizationId)
    .gte('txn_date', from)
    .lte('txn_date', to)
    .limit(MAX_ROWS);

  const vehicleId = url.searchParams.get('vehicle_id');
  if (vehicleId) query = query.eq('vehicle_id', vehicleId);

  const driverId = url.searchParams.get('driver_id');
  if (driverId) query = query.eq('driver_id', driverId);

  const { data, error } = await query;

  if (error) {
    console.error('[api/v1] financial summary failed:', error);
    return apiError('internal_error', 'Could not build the summary.');
  }

  const rows = (data ?? []) as unknown as Row[];
  const categories = await loadCategoryMap(admin, ctx.organizationId);

  let income = 0;
  let expenses = 0;
  const byCategory = new Map<
    string,
    { category_id: string; key: string; name: string; kind: string; total: number; count: number }
  >();

  for (const row of rows) {
    const cat = categories.get(String(row.category_id));
    const amount = Number(row.amount) || 0;
    const kind = cat?.kind === 'income' ? 'income' : 'expense';

    if (kind === 'income') income += amount;
    else expenses += amount;

    const id = row.category_id;
    const entry = byCategory.get(id) ?? {
      category_id: id,
      key: cat?.key ?? '',
      name: cat?.name ?? 'Uncategorised',
      kind,
      total: 0,
      count: 0,
    };
    entry.total += amount;
    entry.count += 1;
    byCategory.set(id, entry);
  }

  const round = (n: number) => Math.round(n * 100) / 100;

  return apiSuccess(
    {
      from,
      to,
      income: round(income),
      expenses: round(expenses),
      net: round(income - expenses),
      transaction_count: rows.length,
      by_category: Array.from(byCategory.values())
        .map((c) => ({ ...c, total: round(c.total) }))
        .sort((a, b) => b.total - a.total),
    },
    {
      meta: {
        // Honest about the cap: a range this big needs paging the ledger itself.
        truncated: rows.length >= MAX_ROWS,
        max_transactions: MAX_ROWS,
      },
    },
  );
});
