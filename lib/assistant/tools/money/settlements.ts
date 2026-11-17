// settlements_summary — driver payouts for a period: per settlement and per
// driver, with totals and paid / unpaid status.
//
// Reads the stored (frozen) figures exactly as the Settlements page does
// (app/fleet/settlements/page.tsx, app/api/settlements/route.ts): every amount
// was computed by lib/utils/settlementCalculations.ts calculateSettlement()
// when the settlement was saved, so nothing is recalculated here.
//   gross_fare     total_gross_fare  (sum of platform gross fares)
//   net            total_net         (driver share − platform fee borne)
//   final_balance  final_balance     (platform balances + wage − tax − rent)
//   adjustments    total_adjustments (frozen, signed; 20260612_freeze_adjustments)
//   payable        final_balance + total_adjustments — "amount owed", the same
//                  sum the driver app and the PDF export show.
// Status: driver_settlements.status is only 'draft' | 'finalized'; "paid" is
// paid_at being set (20241206_settlement_paid_status), as on the page.
// A settlement belongs to the period its week_start falls in.

import type { AssistantTool, Source } from '../../types';
import { argEnum, argId, capList, dedupeSources, money } from '../args';
import { PERIOD_SCHEMA, localDay, resolvePeriod } from '../../period';
import { resolvePlatforms, type OrgPlatformLike } from '@/lib/config/settlements';
import { readAllPages } from './finance';

const MAX_ROWS = 5_000;
const MAX_LIST = 40;

const STATUS_FILTERS = ['any', 'draft', 'finalized', 'paid', 'unpaid'] as const;
type DerivedStatus = 'draft' | 'finalized' | 'paid';

interface PlatformLine {
  platform_id: string;
  platform_name: string | null;
  gross_fare: number | string;
  fee: number | string;
  net: number | string;
  cash_ride: number | string;
  tips: number | string;
  campaigns: number | string;
  balance: number | string;
}

interface SettlementRow {
  id: string;
  driver_id: string;
  week_start: string;
  week_end: string;
  week_label: string | null;
  total_gross_fare: number | string;
  total_net: number | string;
  fss_tax: number | string;
  rent_amount: number | string | null;
  wage_amount: number | string | null;
  total_adjustments: number | string | null;
  final_balance: number | string;
  status: string;
  paid_at: string | null;
  drivers: { full_name: string | null } | null;
  settlement_platforms?: PlatformLine[] | null;
}

const num = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const statusOf = (s: SettlementRow): DerivedStatus => (s.paid_at ? 'paid' : s.status === 'finalized' ? 'finalized' : 'draft');

export const settlementsSummaryTool: AssistantTool = {
  name: 'settlements_summary',
  status: 'Checking settlements…',
  description:
    'Driver settlements (weekly or pay-cycle payouts) whose period starts in the given dates: per driver gross fare, net, adjustments, final balance, amount payable, status (draft / finalized / paid) and paid date, plus totals. ' +
    'With driver_id, also the per-platform breakdown (Bolt, Uber, …). ' +
    'Use for "who hasn\'t been paid this week", "how much do I owe drivers", "what did Maria earn last month", "total payouts in October". ' +
    'payable = final_balance + adjustments (what the driver is owed; negative means the driver owes the fleet). Amounts are plain numbers in `currency`.',
  parameters: {
    type: 'object',
    properties: {
      period: PERIOD_SCHEMA,
      driver_id: { type: 'string', description: 'Only this driver (id from find / the page). Adds the per-platform breakdown.' },
      status: {
        type: 'string',
        enum: [...STATUS_FILTERS],
        description: 'draft, finalized (not yet paid), paid, or unpaid (draft + finalized). Default any.',
      },
    },
  },
  roles: ['admin'],
  module: 'settlements',
  async run(ctx, args) {
    const period = resolvePeriod(ctx, args.period, 'this_month');
    const driverId = argId(args, 'driver_id');
    const statusFilter = argEnum(args, 'status', STATUS_FILTERS, 'any');

    const columns =
      'id, driver_id, week_start, week_end, week_label, total_gross_fare, total_net, fss_tax, rent_amount, wage_amount, total_adjustments, final_balance, status, paid_at, drivers:driver_id(full_name)' +
      (driverId ? ', settlement_platforms(platform_id, platform_name, gross_fare, fee, net, cash_ride, tips, campaigns, balance)' : '');

    const [res, platformsRes, driverRes] = await Promise.all([
      readAllPages<SettlementRow>(
        'driver_settlements',
        (from, to, withCount) => {
          let q = ctx.db
            .from('driver_settlements')
            .select(columns, withCount ? { count: 'exact' } : undefined)
            .eq('organization_id', ctx.orgId)
            .gte('week_start', period.from)
            .lte('week_start', period.to);
          if (driverId) q = q.eq('driver_id', driverId);
          return q.order('week_start', { ascending: false }).order('id', { ascending: true }).range(from, to);
        },
        MAX_ROWS,
      ),
      driverId
        ? ctx.db
            .from('org_platforms')
            .select('key, name, default_fee_pct, icon, color')
            .eq('organization_id', ctx.orgId)
        : Promise.resolve(null),
      driverId
        ? ctx.db.from('drivers').select('full_name').eq('organization_id', ctx.orgId).eq('id', driverId).maybeSingle()
        : Promise.resolve(null),
    ]);
    const driverName = driverId
      ? ((driverRes?.data as { full_name: string | null } | null)?.full_name ?? 'Unknown driver')
      : undefined;

    const all = res.rows;
    const rows = all.filter((s) => {
      const st = statusOf(s);
      if (statusFilter === 'any') return true;
      if (statusFilter === 'unpaid') return st !== 'paid';
      return st === statusFilter;
    });

    const nameOf = (s: SettlementRow) => s.drivers?.full_name || 'Unnamed driver';
    const payableOf = (s: SettlementRow) => num(s.final_balance) + num(s.total_adjustments);

    // ---- totals --------------------------------------------------------------
    const totals = { gross_fare: 0, net: 0, tax: 0, rent: 0, wage: 0, final_balance: 0, adjustments: 0, payable: 0, unpaid_payable: 0 };
    const statusCounts: Record<DerivedStatus, number> = { draft: 0, finalized: 0, paid: 0 };
    for (const s of rows) {
      totals.gross_fare += num(s.total_gross_fare);
      totals.net += num(s.total_net);
      totals.tax += num(s.fss_tax);
      totals.rent += num(s.rent_amount);
      totals.wage += num(s.wage_amount);
      totals.final_balance += num(s.final_balance);
      totals.adjustments += num(s.total_adjustments);
      totals.payable += payableOf(s);
      const st = statusOf(s);
      statusCounts[st]++;
      if (st !== 'paid') totals.unpaid_payable += payableOf(s);
    }

    // ---- per settlement (newest week first, then by name) --------------------
    const ordered = [...rows].sort((a, b) => b.week_start.localeCompare(a.week_start) || nameOf(a).localeCompare(nameOf(b)));
    const list = capList(ordered, MAX_LIST);

    // ---- per driver, when the period holds more than one week per driver ----
    const byDriver = new Map<string, { name: string; count: number; gross: number; net: number; adj: number; final: number; payable: number; unpaid: number; unpaidPayable: number }>();
    for (const s of rows) {
      const d = byDriver.get(s.driver_id) ?? { name: nameOf(s), count: 0, gross: 0, net: 0, adj: 0, final: 0, payable: 0, unpaid: 0, unpaidPayable: 0 };
      d.count++;
      d.gross += num(s.total_gross_fare);
      d.net += num(s.total_net);
      d.adj += num(s.total_adjustments);
      d.final += num(s.final_balance);
      d.payable += payableOf(s);
      if (statusOf(s) !== 'paid') {
        d.unpaid++;
        d.unpaidPayable += payableOf(s);
      }
      byDriver.set(s.driver_id, d);
    }
    const driverList =
      byDriver.size < rows.length
        ? capList(
            [...byDriver.values()].sort((a, b) => b.payable - a.payable),
            MAX_LIST,
          )
        : null;

    // ---- per platform, for one driver ---------------------------------------
    let platforms: Record<string, unknown>[] | undefined;
    if (driverId) {
      // Current platform names (Settlement Rules), falling back to the name
      // snapshotted on the line — same list the Settlements page resolves.
      const configured = resolvePlatforms((platformsRes?.data ?? null) as OrgPlatformLike[] | null);
      const label = new Map(configured.map((p) => [p.id, p.name]));
      const agg = new Map<string, { name: string; gross: number; fee: number; net: number; cash: number; tips: number; campaigns: number; balance: number }>();
      for (const s of rows) {
        for (const p of s.settlement_platforms ?? []) {
          const a = agg.get(p.platform_id) ?? {
            name: label.get(p.platform_id) ?? p.platform_name ?? p.platform_id,
            gross: 0, fee: 0, net: 0, cash: 0, tips: 0, campaigns: 0, balance: 0,
          };
          a.gross += num(p.gross_fare);
          a.fee += num(p.fee);
          a.net += num(p.net);
          a.cash += num(p.cash_ride);
          a.tips += num(p.tips);
          a.campaigns += num(p.campaigns);
          a.balance += num(p.balance);
          agg.set(p.platform_id, a);
        }
      }
      platforms = [...agg.values()]
        .sort((a, b) => b.gross - a.gross)
        .map((a) => ({
          platform: a.name,
          gross_fare: money(a.gross),
          fee_borne_by_driver: money(a.fee),
          net: money(a.net),
          cash_collected: money(a.cash),
          tips: money(a.tips),
          campaigns: money(a.campaigns),
          balance: money(a.balance),
        }));
    }

    const sources: Source[] = [{ label: 'Settlements', href: '/fleet/settlements' }];
    if (driverId && driverName) sources.push({ label: driverName, href: `/fleet/drivers/${driverId}` });
    if (totals.adjustments !== 0) sources.push({ label: 'Adjustments', href: '/fleet/adjustments' });

    return {
      data: {
        period: period.label,
        from: period.from,
        to: period.to,
        period_rule: 'Settlements whose week_start is in these dates.',
        currency: ctx.currency.code,
        filters: { status: statusFilter, ...(driverName ? { driver: driverName } : {}) },
        settlement_count: rows.length,
        driver_count: byDriver.size,
        status_counts: statusCounts,
        totals: {
          gross_fare: money(totals.gross_fare),
          net: money(totals.net),
          tax: money(totals.tax),
          rent: money(totals.rent),
          wage: money(totals.wage),
          final_balance: money(totals.final_balance),
          adjustments: money(totals.adjustments),
          payable: money(totals.payable),
          still_unpaid: money(totals.unpaid_payable),
        },
        settlements: list.items.map((s) => ({
          driver: nameOf(s),
          week_start: s.week_start,
          week_end: s.week_end,
          ...(s.week_label ? { label: s.week_label } : {}),
          gross_fare: money(s.total_gross_fare),
          net: money(s.total_net),
          tax: money(s.fss_tax),
          ...(num(s.rent_amount) ? { rent: money(s.rent_amount) } : {}),
          ...(num(s.wage_amount) ? { wage: money(s.wage_amount) } : {}),
          final_balance: money(s.final_balance),
          adjustments: money(s.total_adjustments),
          payable: money(payableOf(s)),
          status: statusOf(s),
          ...(s.paid_at ? { paid_on: localDay(s.paid_at, ctx.timeZone) } : {}),
        })),
        settlements_truncated: list.truncated,
        ...(driverList
          ? {
              by_driver: driverList.items.map((d) => ({
                driver: d.name,
                settlements: d.count,
                gross_fare: money(d.gross),
                net: money(d.net),
                adjustments: money(d.adj),
                final_balance: money(d.final),
                payable: money(d.payable),
                unpaid_settlements: d.unpaid,
                still_unpaid: money(d.unpaidPayable),
              })),
              by_driver_truncated: driverList.truncated,
            }
          : {}),
        ...(platforms ? { platforms } : {}),
        ...(res.truncated ? { rows_capped: `Only the first ${MAX_ROWS} settlements were read; ask for a shorter period.` } : {}),
      },
      sources: dedupeSources(sources).slice(0, 6),
    };
  },
};
