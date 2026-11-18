// finance_summary — income, expenses and net from the bookkeeping ledger.
//
// Mirrors app/api/v1/financials/summary/route.ts: finance_transactions over an
// inclusive txn_date range, `amount` always positive, direction taken from the
// category's `kind` (anything not 'income' counts as an expense, as there).
// Week / month buckets use bucketFor() from lib/utils/financeRanges — the same
// Monday-start weeks and calendar months the Financials page groups by.
//
// Read-only caveat: the Bookkeeping and Financials pages post any repeating
// costs that fell due before rendering (postDueRecurringCosts). The assistant
// never writes, so a repeating bill due since the last daily cron run can be
// missing here until someone opens one of those pages.

import type { AssistantContext, AssistantTool, Source } from '../../types';
import { argBool, argEnum, argId, capList, dedupeSources, money } from '../args';
import { PERIOD_SCHEMA, previousPeriod, resolvePeriod, type Period } from '../../period';
import { bucketFor } from '@/lib/utils/financeRanges';

// -----------------------------------------------------------------------------
// Shared helpers for the money tools (paging, names, deltas).
// -----------------------------------------------------------------------------

/**
 * PostgREST hands back at most 1,000 rows per request (see loadRides in
 * app/fleet/bolt/page.tsx), so anything that can be larger is read in pages.
 */
export const PAGE_SIZE = 1000;
const PAGE_CONCURRENCY = 6;

interface PageResponse {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
}

/**
 * Read every row of a query, page by page, up to `maxRows`. `page` builds the
 * query for one slice; it is asked for an exact count on the first call only.
 */
export async function readAllPages<T>(
  label: string,
  page: (from: number, to: number, withCount: boolean) => PromiseLike<PageResponse>,
  maxRows: number,
): Promise<{ rows: T[]; total: number; truncated: boolean }> {
  const first = await page(0, PAGE_SIZE - 1, true);
  if (first.error) throw new Error(`${label}: ${first.error.message}`);
  const rows = [...((first.data ?? []) as T[])];
  const total = first.count ?? rows.length;
  const wanted = Math.min(total, maxRows);

  const starts: number[] = [];
  for (let s = PAGE_SIZE; s < wanted; s += PAGE_SIZE) starts.push(s);
  for (let i = 0; i < starts.length; i += PAGE_CONCURRENCY) {
    const batch = await Promise.all(
      starts.slice(i, i + PAGE_CONCURRENCY).map((s) => page(s, Math.min(s + PAGE_SIZE, wanted) - 1, false)),
    );
    for (const r of batch) {
      if (r.error) throw new Error(`${label}: ${r.error.message}`);
      rows.push(...((r.data ?? []) as T[]));
    }
  }
  return { rows: rows.slice(0, maxRows), total, truncated: total > maxRows };
}

/** "ABC 123 · Toyota Prius" — plate first, as everywhere in the dashboard. */
export function vehicleName(v: { registration_number?: string | null; make?: string | null; model?: string | null }): string {
  return [v.registration_number, [v.make, v.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ') || 'Vehicle';
}

/** Change from `prev` to `cur`, with a percentage when it means something. */
export function delta(cur: number, prev: number): { change: number; change_pct: number | null } {
  return {
    change: money(cur - prev),
    change_pct: prev !== 0 ? Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10 : null,
  };
}

export interface CategoryRef {
  id: string;
  name: string;
  kind: 'income' | 'expense';
}

/** The fleet's chart of accounts (same read as loadCategoryMap in lib/api/resources/transactions.ts). */
export async function loadCategories(ctx: AssistantContext): Promise<Map<string, CategoryRef>> {
  const { data, error } = await ctx.db
    .from('org_finance_categories')
    .select('id, name, kind')
    .eq('organization_id', ctx.orgId);
  if (error) throw new Error(`org_finance_categories: ${error.message}`);
  const map = new Map<string, CategoryRef>();
  for (const c of (data ?? []) as { id: string; name: string | null; kind: string | null }[]) {
    map.set(String(c.id), { id: String(c.id), name: c.name || 'Uncategorised', kind: c.kind === 'income' ? 'income' : 'expense' });
  }
  return map;
}

async function loadVehicleNames(ctx: AssistantContext): Promise<Map<string, string>> {
  const { data, error } = await ctx.db
    .from('vehicles')
    .select('id, registration_number, make, model')
    .eq('organization_id', ctx.orgId)
    .range(0, 4999);
  if (error) throw new Error(`vehicles: ${error.message}`);
  const rows = (data ?? []) as { id: string; registration_number: string | null; make: string | null; model: string | null }[];
  return new Map(rows.map((v) => [v.id, vehicleName(v)]));
}

async function loadDriverNames(ctx: AssistantContext): Promise<Map<string, string>> {
  const { data, error } = await ctx.db
    .from('drivers')
    .select('id, full_name')
    .eq('organization_id', ctx.orgId)
    .range(0, 4999);
  if (error) throw new Error(`drivers: ${error.message}`);
  const rows = (data ?? []) as { id: string; full_name: string | null }[];
  return new Map(rows.map((d) => [d.id, d.full_name || 'Unnamed driver']));
}

// -----------------------------------------------------------------------------
// The tool.
// -----------------------------------------------------------------------------

/** Same guard-rail as the v1 summary: a report, not a ledger export. */
const MAX_ROWS = 20_000;
const MAX_GROUPS = 40;

const GROUP_BY = ['category', 'vehicle', 'driver', 'month', 'week'] as const;
type GroupBy = (typeof GROUP_BY)[number];
const KINDS = ['all', 'income', 'expense'] as const;

const NONE = '__none__';

interface TxnRow {
  txn_date: string;
  amount: number | string;
  category_id: string;
  vehicle_id: string | null;
  driver_id: string | null;
}

interface Agg {
  income: number;
  expenses: number;
  count: number;
}

const emptyAgg = (): Agg => ({ income: 0, expenses: 0, count: 0 });

function keyFor(row: TxnRow, groupBy: GroupBy): string {
  switch (groupBy) {
    case 'category':
      return String(row.category_id);
    case 'vehicle':
      return row.vehicle_id ?? NONE;
    case 'driver':
      return row.driver_id ?? NONE;
    case 'month':
      return bucketFor(row.txn_date, 'monthly').key;
    case 'week':
      return bucketFor(row.txn_date, 'weekly').key;
  }
}

function aggregate(rows: TxnRow[], categories: Map<string, CategoryRef>, groupBy: GroupBy) {
  const totals = emptyAgg();
  const groups = new Map<string, Agg>();
  for (const row of rows) {
    const amount = Number(row.amount) || 0;
    const isIncome = categories.get(String(row.category_id))?.kind === 'income';
    const key = keyFor(row, groupBy);
    const g = groups.get(key) ?? emptyAgg();
    if (isIncome) {
      totals.income += amount;
      g.income += amount;
    } else {
      totals.expenses += amount;
      g.expenses += amount;
    }
    totals.count++;
    g.count++;
    groups.set(key, g);
  }
  return { totals, groups };
}

/** Every week / month bucket the period touches, so empty ones show as 0. */
function timeBuckets(p: Period, by: 'weekly' | 'monthly'): Map<string, string> {
  const out = new Map<string, string>();
  const end = Date.parse(`${p.to}T00:00:00Z`);
  for (let t = Date.parse(`${p.from}T00:00:00Z`); t <= end; t += 86_400_000) {
    const b = bucketFor(new Date(t).toISOString().slice(0, 10), by);
    if (!out.has(b.key)) out.set(b.key, b.label);
  }
  return out;
}

export const financeSummaryTool: AssistantTool = {
  name: 'finance_summary',
  status: 'Checking the books…',
  description:
    'Bookkeeping totals from the ledger: income, expenses and net profit for a period, grouped by category (default), vehicle, driver, month or week. ' +
    'Optional filters: one vehicle, one driver, or only income / only expenses; optional comparison with the previous period. ' +
    'Use for "how much did we spend on fuel this month", "what was our profit last quarter", "income vs last month", "which category grew", "expenses per week". ' +
    'For the full running cost of each car (bookkeeping + services + damage repairs + parts) use vehicle_costs instead. ' +
    'Amounts are plain numbers in `currency`; income vs expense comes from the category kind.',
  parameters: {
    type: 'object',
    properties: {
      period: PERIOD_SCHEMA,
      group_by: {
        type: 'string',
        enum: [...GROUP_BY],
        description: 'How to break the totals down. Default category.',
      },
      kind: { type: 'string', enum: [...KINDS], description: 'Only income or only expense lines. Default all.' },
      vehicle_id: { type: 'string', description: 'Only lines linked to this vehicle (id from find / the page).' },
      driver_id: { type: 'string', description: 'Only lines linked to this driver (id from find / the page).' },
      compare_previous: {
        type: 'boolean',
        description: 'Also return the equal-length period just before (a calendar month compares to the previous month).',
      },
    },
  },
  roles: ['admin'],
  module: 'bookkeeping',
  async run(ctx, args) {
    const period = resolvePeriod(ctx, args.period, 'this_month');
    const groupBy = argEnum(args, 'group_by', GROUP_BY, 'category');
    const kind = argEnum(args, 'kind', KINDS, 'all');
    const vehicleId = argId(args, 'vehicle_id');
    const driverId = argId(args, 'driver_id');
    const compare = argBool(args, 'compare_previous');
    const prevPeriod = compare ? previousPeriod(period) : null;

    const needVehicles = groupBy === 'vehicle' || Boolean(vehicleId);
    const needDrivers = groupBy === 'driver' || Boolean(driverId);
    const [categories, vehicles, drivers] = await Promise.all([
      loadCategories(ctx),
      needVehicles ? loadVehicleNames(ctx) : Promise.resolve(new Map<string, string>()),
      needDrivers ? loadDriverNames(ctx) : Promise.resolve(new Map<string, string>()),
    ]);

    // Narrow by kind in the query (via the category ids) so the row cap is spent
    // on lines that count.
    const categoryIds =
      kind === 'all' ? null : [...categories.values()].filter((c) => c.kind === kind).map((c) => c.id);

    const load = async (p: Period) => {
      if (categoryIds && categoryIds.length === 0) return { rows: [] as TxnRow[], total: 0, truncated: false };
      return readAllPages<TxnRow>(
        'finance_transactions',
        (from, to, withCount) => {
          let q = ctx.db
            .from('finance_transactions')
            .select('txn_date, amount, category_id, vehicle_id, driver_id', withCount ? { count: 'exact' } : undefined)
            .eq('organization_id', ctx.orgId)
            .gte('txn_date', p.from)
            .lte('txn_date', p.to);
          if (vehicleId) q = q.eq('vehicle_id', vehicleId);
          if (driverId) q = q.eq('driver_id', driverId);
          if (categoryIds) q = q.in('category_id', categoryIds);
          return q.order('txn_date', { ascending: true }).order('id', { ascending: true }).range(from, to);
        },
        MAX_ROWS,
      );
    };

    const [cur, prev] = await Promise.all([load(period), prevPeriod ? load(prevPeriod) : Promise.resolve(null)]);
    const now = aggregate(cur.rows, categories, groupBy);
    const before = prev ? aggregate(prev.rows, categories, groupBy) : null;

    // ---- groups -------------------------------------------------------------
    const isTime = groupBy === 'month' || groupBy === 'week';
    let groups: Record<string, unknown>[];
    let truncated = false;
    let totalGroups: number;
    let topLinks: Source[] = [];

    if (isTime) {
      // Every bucket in the period, oldest first; the previous period has other
      // buckets, so only the headline totals are compared.
      const buckets = timeBuckets(period, groupBy === 'month' ? 'monthly' : 'weekly');
      const all = [...buckets.entries()].map(([key, label]) => {
        const g = now.groups.get(key) ?? emptyAgg();
        return {
          [groupBy === 'month' ? 'month' : 'week_start']: key,
          label,
          income: money(g.income),
          expenses: money(g.expenses),
          net: money(g.income - g.expenses),
          count: g.count,
        };
      });
      totalGroups = all.length;
      truncated = all.length > MAX_GROUPS;
      groups = all.slice(-MAX_GROUPS); // keep the most recent buckets
    } else {
      const keys = new Set([...now.groups.keys(), ...(before ? before.groups.keys() : [])]);
      const nameOf = (key: string): string => {
        if (groupBy === 'category') return categories.get(key)?.name ?? 'Uncategorised';
        if (key === NONE) return groupBy === 'vehicle' ? 'Not linked to a vehicle' : 'Not linked to a driver';
        return (groupBy === 'vehicle' ? vehicles.get(key) : drivers.get(key)) ?? (groupBy === 'vehicle' ? 'Removed vehicle' : 'Removed driver');
      };
      const rows = [...keys].map((key) => {
        const g = now.groups.get(key) ?? emptyAgg();
        const p = before?.groups.get(key);
        if (groupBy === 'category') {
          const k = categories.get(key)?.kind ?? 'expense';
          const total = k === 'income' ? g.income : g.expenses;
          const prevTotal = p ? (k === 'income' ? p.income : p.expenses) : 0;
          return {
            sort: total,
            key,
            row: {
              category: nameOf(key),
              kind: k,
              total: money(total),
              count: g.count,
              ...(before ? { previous_total: money(prevTotal), ...delta(total, prevTotal) } : {}),
            },
          };
        }
        const sortBy = kind === 'income' ? g.income : kind === 'expense' ? g.expenses : g.income + g.expenses;
        return {
          sort: sortBy,
          key,
          row: {
            [groupBy]: nameOf(key),
            income: money(g.income),
            expenses: money(g.expenses),
            net: money(g.income - g.expenses),
            count: g.count,
            ...(before
              ? {
                  previous: {
                    income: money(p?.income ?? 0),
                    expenses: money(p?.expenses ?? 0),
                    net: money((p?.income ?? 0) - (p?.expenses ?? 0)),
                  },
                }
              : {}),
          },
        };
      });
      rows.sort((a, b) => b.sort - a.sort);
      const list = capList(rows, MAX_GROUPS);
      groups = list.items.map((r) => r.row);
      truncated = list.truncated;
      totalGroups = list.total;

      // Link the biggest vehicles / drivers in the answer's sources.
      if (groupBy === 'vehicle' || groupBy === 'driver') {
        const known = groupBy === 'vehicle' ? vehicles : drivers;
        topLinks = list.items
          .filter((r) => known.has(r.key))
          .slice(0, 3)
          .map((r) => ({ label: nameOf(r.key), href: `/fleet/${groupBy === 'vehicle' ? 'vehicles' : 'drivers'}/${r.key}` }));
      }
    }

    const income = now.totals.income;
    const expenses = now.totals.expenses;
    const sources: Source[] = [
      { label: 'Financials', href: '/fleet/financials' },
      { label: 'Bookkeeping', href: '/fleet/earnings' },
    ];
    if (vehicleId) sources.push({ label: vehicles.get(vehicleId) ?? 'Vehicle', href: `/fleet/vehicles/${vehicleId}` });
    if (driverId) sources.push({ label: drivers.get(driverId) ?? 'Driver', href: `/fleet/drivers/${driverId}` });
    sources.push(...topLinks);

    return {
      data: {
        period: period.label,
        from: period.from,
        to: period.to,
        currency: ctx.currency.code,
        filters: {
          kind,
          ...(vehicleId ? { vehicle: vehicles.get(vehicleId) ?? 'unknown vehicle' } : {}),
          ...(driverId ? { driver: drivers.get(driverId) ?? 'unknown driver' } : {}),
        },
        income: money(income),
        expenses: money(expenses),
        net: money(income - expenses),
        transaction_count: now.totals.count,
        group_by: groupBy,
        groups,
        total_groups: totalGroups,
        groups_truncated: truncated,
        ...(truncated && isTime ? { groups_note: `Only the most recent ${MAX_GROUPS} buckets are listed.` } : {}),
        ...(prev && before && prevPeriod
          ? {
              previous: {
                period: prevPeriod.label,
                from: prevPeriod.from,
                to: prevPeriod.to,
                income: money(before.totals.income),
                expenses: money(before.totals.expenses),
                net: money(before.totals.income - before.totals.expenses),
                transaction_count: before.totals.count,
              },
              change: {
                income: delta(income, before.totals.income),
                expenses: delta(expenses, before.totals.expenses),
                net: delta(income - expenses, before.totals.income - before.totals.expenses),
              },
            }
          : {}),
        ...(cur.truncated || prev?.truncated
          ? { rows_capped: `Only the first ${MAX_ROWS} ledger lines were read; totals are incomplete. Ask for a shorter period.` }
          : {}),
      },
      sources: dedupeSources(sources).slice(0, 6),
    };
  },
};
