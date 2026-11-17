// vehicle_costs — what each car cost the fleet in a period, ranked.
//
// Four sources, each read from the table the matching dashboard page shows:
//   bookkeeping  finance_transactions lines with an EXPENSE category and a
//                vehicle_id (manual lines + repeating costs such as lease or
//                insurance, which lib/bookkeeping/recurring.ts posts with the
//                cost's vehicle_id). Income lines with a vehicle_id give the
//                car's income and net. Direction from the category kind, as in
//                app/api/v1/financials/summary/route.ts.
//   services     vehicle_services.cost by service_date (app/fleet/services:
//                cost summed per record). Dates after today are scheduled
//                work, not spend, so they are left out and counted.
//   damages      vehicle_damages.repair_cost of damages marked repaired, dated
//                by repaired_at. The create API never stamps repaired_at (only
//                the edit form does), so a damage logged straight as repaired
//                falls back to reported_at. Costs on damages not yet repaired
//                are estimates: reported separately, never in the total.
//   parts        part_usage logged against the car × unit_cost_at_use (the
//                price snapshot taken when it was used; current parts.unit_cost
//                if no snapshot).
//
// DOUBLE COUNTING: services, damages and parts do NOT post anything into
// finance_transactions — its `source` is only 'manual' | 'recurring' |
// 'period_import', and the only writers are lib/actions/finance-transactions.ts,
// lib/bookkeeping/recurring.ts and the v1 transactions API. So the four sources
// are independent and are added up. The one way a bill counts twice is a
// person typing it into both places; same car + same amount within 7 days is
// flagged as `possible_double_entries` (not subtracted — the model says so).

import type { AssistantContext, AssistantTool, Source } from '../../types';
import { argBool, argId, argInt, capList, dedupeSources, money } from '../args';
import { PERIOD_SCHEMA, periodBoundsUtc, resolvePeriod, daysBetween, localDay } from '../../period';
import { loadCategories, readAllPages, vehicleName } from './finance';

const MAX_LEDGER_ROWS = 20_000;
const MAX_ROWS = 5_000;
const DUPLICATE_WINDOW_DAYS = 7;

interface VehicleRow {
  id: string;
  registration_number: string | null;
  make: string | null;
  model: string | null;
  status: string | null;
}

interface TxnRow {
  id: string;
  txn_date: string;
  amount: number | string;
  category_id: string;
  vehicle_id: string | null;
}

interface ServiceRow {
  id: string;
  vehicle_id: string;
  service_date: string;
  service_type: string | null;
  cost: number | string | null;
  currency: string | null;
}

interface DamageRow {
  id: string;
  vehicle_id: string;
  zone: string | null;
  severity: string | null;
  status: string;
  repair_cost: number | string | null;
  currency: string | null;
  reported_at: string;
  repaired_at: string | null;
}

interface UsageRow {
  vehicle_id: string | null;
  service_id: string | null;
  quantity: number;
  unit_cost_at_use: number | string | null;
  used_at: string;
  parts: { name: string | null; unit_cost: number | string | null } | null;
}

interface Costs {
  bookkeeping: number;
  services: number;
  damages: number;
  parts: number;
  income: number;
  categories: Map<string, number>;
}

/** One cost line, kept for the single-vehicle breakdown and the duplicate check. */
interface Item {
  vehicleId: string;
  source: 'bookkeeping' | 'service' | 'damage_repair' | 'parts';
  what: string;
  date: string;
  amount: number;
}

const emptyCosts = (): Costs => ({ bookkeeping: 0, services: 0, damages: 0, parts: 0, income: 0, categories: new Map() });
const human = (s: string | null | undefined) => (s ? s.replace(/_/g, ' ') : '');
const num = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export const vehicleCostsTool: AssistantTool = {
  name: 'vehicle_costs',
  status: 'Adding up vehicle costs…',
  description:
    'Total cost per vehicle for a period, ranked from most to least expensive: bookkeeping expenses linked to the car (fuel, lease, insurance, repairs typed into the ledger, repeating costs), ' +
    'service costs, damage repair costs and spare parts used — each shown separately — plus income linked to the car and net. ' +
    'Use for "which car cost me the most last month", "what did ABC123 cost this year", "running costs per vehicle", "most expensive car to keep". ' +
    'Pass vehicle_id for one car with its biggest cost lines. Amounts are plain numbers in `currency`.',
  parameters: {
    type: 'object',
    properties: {
      period: PERIOD_SCHEMA,
      vehicle_id: { type: 'string', description: 'Only this vehicle (id from find / the page); adds its biggest cost lines.' },
      limit: { type: 'integer', description: 'How many vehicles to list (default 20, max 40).' },
      include_unlinked: {
        type: 'boolean',
        description: 'Also report fleet-wide costs not linked to any vehicle (default true).',
      },
    },
  },
  roles: ['admin'],
  module: 'bookkeeping',
  async run(ctx, args) {
    const period = resolvePeriod(ctx, args.period, 'this_month');
    const vehicleId = argId(args, 'vehicle_id');
    const limit = argInt(args, 'limit', 20, 1, 40);
    const includeUnlinked = argBool(args, 'include_unlinked', true);
    const withMaintenance = ctx.modules.has('maintenance');
    const withParts = ctx.modules.has('parts');
    const { startIso, endIso } = periodBoundsUtc(period, ctx.timeZone);
    const currency = ctx.currency.code.toUpperCase();

    const [vehiclesRes, categories, ledger, services, damages, usage] = await Promise.all([
      ctx.db
        .from('vehicles')
        .select('id, registration_number, make, model, status')
        .eq('organization_id', ctx.orgId)
        .range(0, 4999),
      loadCategories(ctx),
      readAllPages<TxnRow>(
        'finance_transactions',
        (from, to, withCount) => {
          let q = ctx.db
            .from('finance_transactions')
            .select('id, txn_date, amount, category_id, vehicle_id', withCount ? { count: 'exact' } : undefined)
            .eq('organization_id', ctx.orgId)
            .gte('txn_date', period.from)
            .lte('txn_date', period.to);
          if (vehicleId) q = q.eq('vehicle_id', vehicleId);
          else if (!includeUnlinked) q = q.not('vehicle_id', 'is', null);
          return q.order('txn_date', { ascending: true }).order('id', { ascending: true }).range(from, to);
        },
        MAX_LEDGER_ROWS,
      ),
      withMaintenance ? loadServices(ctx, period.from, period.to, vehicleId) : Promise.resolve(null),
      withMaintenance ? loadDamages(ctx, startIso, endIso, vehicleId) : Promise.resolve(null),
      withParts ? loadUsage(ctx, period.from, period.to, vehicleId, includeUnlinked) : Promise.resolve(null),
    ]);
    if (vehiclesRes.error) throw new Error(`vehicles: ${vehiclesRes.error.message}`);
    const vehicles = new Map(((vehiclesRes.data ?? []) as VehicleRow[]).map((v) => [v.id, v]));

    const byVehicle = new Map<string, Costs>();
    const costsFor = (id: string) => {
      let c = byVehicle.get(id);
      if (!c) byVehicle.set(id, (c = emptyCosts()));
      return c;
    };
    const items: Item[] = [];
    const unlinked = { bookkeeping_expenses: 0, bookkeeping_income: 0, parts: 0 };
    let otherCurrency = 0;

    // ---- bookkeeping --------------------------------------------------------
    const ledgerExpenses: Item[] = [];
    for (const t of ledger.rows) {
      const cat = categories.get(String(t.category_id));
      const amount = num(t.amount);
      const isIncome = cat?.kind === 'income';
      if (!t.vehicle_id) {
        if (isIncome) unlinked.bookkeeping_income += amount;
        else unlinked.bookkeeping_expenses += amount;
        continue;
      }
      const c = costsFor(t.vehicle_id);
      if (isIncome) {
        c.income += amount;
        continue;
      }
      const name = cat?.name ?? 'Uncategorised';
      c.bookkeeping += amount;
      c.categories.set(name, (c.categories.get(name) ?? 0) + amount);
      const item: Item = { vehicleId: t.vehicle_id, source: 'bookkeeping', what: name, date: t.txn_date, amount };
      items.push(item);
      ledgerExpenses.push(item);
    }

    // ---- services: spend up to today; later dates are scheduled work ---------
    let scheduledExcluded = 0;
    for (const s of services?.rows ?? []) {
      if (s.service_date > ctx.today) {
        scheduledExcluded++;
        continue;
      }
      if (s.currency && s.currency.toUpperCase() !== currency) {
        otherCurrency++;
        continue;
      }
      const amount = num(s.cost);
      if (amount <= 0) continue;
      costsFor(s.vehicle_id).services += amount;
      items.push({ vehicleId: s.vehicle_id, source: 'service', what: human(s.service_type) || 'service', date: s.service_date, amount });
    }

    // ---- damage repairs (repaired only; estimates kept apart) ----------------
    const estimates = { count: 0, total: 0 };
    for (const d of damages?.rows ?? []) {
      const amount = num(d.repair_cost);
      if (amount <= 0) continue;
      if (d.currency && d.currency.toUpperCase() !== currency) {
        otherCurrency++;
        continue;
      }
      if (d.status !== 'repaired') {
        estimates.count++;
        estimates.total += amount;
        continue;
      }
      costsFor(d.vehicle_id).damages += amount;
      items.push({
        vehicleId: d.vehicle_id,
        source: 'damage_repair',
        what: [human(d.zone), d.severity].filter(Boolean).join(', ') || 'damage repair',
        date: localDay(d.repaired_at ?? d.reported_at, ctx.timeZone),
        amount,
      });
    }

    // ---- parts used ---------------------------------------------------------
    let partsWithoutCost = 0;
    let partsOnServices = 0;
    for (const u of usage?.rows ?? []) {
      const unit = u.unit_cost_at_use ?? u.parts?.unit_cost ?? null;
      if (unit == null) {
        partsWithoutCost++;
        continue;
      }
      const amount = num(unit) * (Number(u.quantity) || 0);
      if (amount <= 0) continue;
      if (!u.vehicle_id) {
        unlinked.parts += amount;
        continue;
      }
      if (u.service_id) partsOnServices++;
      costsFor(u.vehicle_id).parts += amount;
      items.push({ vehicleId: u.vehicle_id, source: 'parts', what: u.parts?.name || 'part', date: u.used_at, amount });
    }

    // ---- possible double entries: same car, same amount, within 7 days -------
    const used = new Set<Item>();
    const doubles: { vehicle: string; amount: number; date: string; logged_as: string; bookkeeping_category: string }[] = [];
    for (const it of items) {
      if (it.source === 'bookkeeping') continue;
      const match = ledgerExpenses.find(
        (l) =>
          !used.has(l) &&
          l.vehicleId === it.vehicleId &&
          Math.abs(l.amount - it.amount) < 0.005 &&
          Math.abs(daysBetween(l.date, it.date)) <= DUPLICATE_WINDOW_DAYS,
      );
      if (!match) continue;
      used.add(match);
      const v = vehicles.get(it.vehicleId);
      doubles.push({
        vehicle: v ? vehicleName(v) : 'Removed vehicle',
        amount: money(it.amount),
        date: it.date,
        logged_as: it.source.replace('_', ' '),
        bookkeeping_category: match.what,
      });
    }

    // ---- rank ---------------------------------------------------------------
    const ranked = [...byVehicle.entries()]
      .map(([id, c]) => {
        const total = c.bookkeeping + c.services + c.damages + c.parts;
        const v = vehicles.get(id);
        return { id, v, c, total };
      })
      .sort((a, b) => b.total - a.total || b.c.income - a.c.income);
    const list = capList(ranked, limit);

    const fleet = ranked.reduce(
      (acc, r) => {
        acc.bookkeeping += r.c.bookkeeping;
        acc.services += r.c.services;
        acc.damages += r.c.damages;
        acc.parts += r.c.parts;
        acc.income += r.c.income;
        return acc;
      },
      { bookkeeping: 0, services: 0, damages: 0, parts: 0, income: 0 },
    );
    const fleetCost = fleet.bookkeeping + fleet.services + fleet.damages + fleet.parts;

    const notIncluded: string[] = [];
    if (!withMaintenance) notIncluded.push('Maintenance module is off: service and damage repair costs are not included.');
    if (!withParts) notIncluded.push('Parts module is off: parts used are not included.');

    const single = vehicleId ? vehicles.get(vehicleId) : undefined;
    const topItems = vehicleId
      ? capList(
          items.filter((i) => i.vehicleId === vehicleId).sort((a, b) => b.amount - a.amount),
          25,
        )
      : null;

    const sources: Source[] = list.items
      .filter((r) => r.v)
      .slice(0, 3)
      .map((r) => ({ label: vehicleName(r.v as VehicleRow), href: `/fleet/vehicles/${r.id}` }));
    if (single) sources.unshift({ label: vehicleName(single), href: `/fleet/vehicles/${single.id}` });
    sources.push({ label: 'Bookkeeping', href: '/fleet/earnings' });
    if (withMaintenance) sources.push({ label: 'Services', href: '/fleet/services' }, { label: 'Damages', href: '/fleet/damages' });
    if (withParts) sources.push({ label: 'Parts', href: '/fleet/parts' });

    return {
      data: {
        period: period.label,
        from: period.from,
        to: period.to,
        currency: ctx.currency.code,
        ...(vehicleId ? { vehicle: single ? vehicleName(single) : 'unknown vehicle' } : {}),
        included: {
          bookkeeping: true,
          services: withMaintenance,
          damage_repairs: withMaintenance,
          parts: withParts,
        },
        ...(notIncluded.length ? { not_included: notIncluded } : {}),
        how_counted: [
          'total_cost = bookkeeping_expenses + services + damage_repairs + parts. Services, damages and parts are not posted into bookkeeping by the app, so nothing is counted twice automatically.',
          'bookkeeping_expenses: ledger lines with an expense category linked to the car (includes repeating costs like lease/insurance). income: ledger income lines linked to the car.',
          'services: service cost by service date, up to today. damage_repairs: repair cost of damages marked repaired, by repair date (report date if no repair date was recorded). parts: parts used on the car x unit cost at the time.',
        ],
        fleet_totals: {
          total_cost: money(fleetCost),
          bookkeeping_expenses: money(fleet.bookkeeping),
          services: money(fleet.services),
          damage_repairs: money(fleet.damages),
          parts: money(fleet.parts),
          income: money(fleet.income),
          net: money(fleet.income - fleetCost),
        },
        vehicles: list.items.map((r) => ({
          vehicle: r.v ? vehicleName(r.v) : 'Removed vehicle',
          ...(r.v?.status ? { status: r.v.status } : {}),
          total_cost: money(r.total),
          bookkeeping_expenses: money(r.c.bookkeeping),
          services: money(r.c.services),
          damage_repairs: money(r.c.damages),
          parts: money(r.c.parts),
          income: money(r.c.income),
          net: money(r.c.income - r.total),
          top_expense_categories: [...r.c.categories.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([category, total]) => ({ category, total: money(total) })),
        })),
        vehicles_with_activity: list.total,
        vehicles_truncated: list.truncated,
        ...(includeUnlinked && !vehicleId
          ? {
              not_linked_to_a_vehicle: {
                bookkeeping_expenses: money(unlinked.bookkeeping_expenses),
                bookkeeping_income: money(unlinked.bookkeeping_income),
                ...(withParts ? { parts: money(unlinked.parts) } : {}),
                note: 'Fleet-wide costs/income with no car attached; not in any vehicle total.',
              },
            }
          : {}),
        ...(estimates.count
          ? {
              unrepaired_damage_estimates: {
                count: estimates.count,
                total: money(estimates.total),
                note: 'Repair costs entered on damages reported in the period that are not repaired yet; not in the totals.',
              },
            }
          : {}),
        ...(scheduledExcluded ? { scheduled_services_excluded: scheduledExcluded } : {}),
        ...(otherCurrency ? { skipped_other_currency_records: otherCurrency } : {}),
        ...(partsWithoutCost ? { parts_used_without_unit_cost: partsWithoutCost } : {}),
        ...(partsOnServices
          ? { parts_logged_against_a_service: partsOnServices, parts_note: 'If that service invoice already includes these parts, they appear in both services and parts.' }
          : {}),
        ...(doubles.length
          ? {
              possible_double_entries: capList(doubles, 10).items,
              possible_double_entries_count: doubles.length,
              possible_double_entries_note:
                'A service/repair/parts cost and a bookkeeping expense on the same car with the same amount within 7 days — maybe the same bill entered twice. Still counted in both; mention it.',
            }
          : {}),
        ...(topItems
          ? { biggest_cost_lines: topItems.items.map(({ source, what, date, amount }) => ({ source, what, date, amount: money(amount) })) }
          : {}),
        ...(ledger.truncated || services?.truncated || damages?.truncated || usage?.truncated
          ? { rows_capped: 'Some records were not read (row cap); totals are incomplete. Ask for a shorter period.' }
          : {}),
      },
      sources: dedupeSources(sources).slice(0, 6),
    };
  },
};

async function loadServices(ctx: AssistantContext, from: string, to: string, vehicleId?: string) {
  return readAllPages<ServiceRow>(
    'vehicle_services',
    (start, end, withCount) => {
      let q = ctx.db
        .from('vehicle_services')
        .select('id, vehicle_id, service_date, service_type, cost, currency', withCount ? { count: 'exact' } : undefined)
        .eq('organization_id', ctx.orgId)
        .gte('service_date', from)
        .lte('service_date', to)
        .not('cost', 'is', null);
      if (vehicleId) q = q.eq('vehicle_id', vehicleId);
      return q.order('service_date', { ascending: true }).order('id', { ascending: true }).range(start, end);
    },
    MAX_ROWS,
  );
}

/**
 * Two reads: damages REPAIRED in the period (by repaired_at), and damages with
 * no repair date REPORTED in the period — the second set holds both damages
 * logged straight as repaired (counted, dated by reported_at) and open ones
 * with an estimate (reported apart).
 */
async function loadDamages(ctx: AssistantContext, startIso: string, endIso: string, vehicleId?: string) {
  const columns = 'id, vehicle_id, zone, severity, status, repair_cost, currency, reported_at, repaired_at';
  const [repaired, undated] = await Promise.all([
    readAllPages<DamageRow>(
      'vehicle_damages',
      (start, end, withCount) => {
        let q = ctx.db
          .from('vehicle_damages')
          .select(columns, withCount ? { count: 'exact' } : undefined)
          .eq('organization_id', ctx.orgId)
          .eq('status', 'repaired')
          .gte('repaired_at', startIso)
          .lt('repaired_at', endIso)
          .not('repair_cost', 'is', null);
        if (vehicleId) q = q.eq('vehicle_id', vehicleId);
        return q.order('repaired_at', { ascending: true }).order('id', { ascending: true }).range(start, end);
      },
      MAX_ROWS,
    ),
    readAllPages<DamageRow>(
      'vehicle_damages',
      (start, end, withCount) => {
        let q = ctx.db
          .from('vehicle_damages')
          .select(columns, withCount ? { count: 'exact' } : undefined)
          .eq('organization_id', ctx.orgId)
          .is('repaired_at', null)
          .gte('reported_at', startIso)
          .lt('reported_at', endIso)
          .not('repair_cost', 'is', null);
        if (vehicleId) q = q.eq('vehicle_id', vehicleId);
        return q.order('reported_at', { ascending: true }).order('id', { ascending: true }).range(start, end);
      },
      MAX_ROWS,
    ),
  ]);
  return { rows: [...repaired.rows, ...undated.rows], truncated: repaired.truncated || undated.truncated };
}

async function loadUsage(ctx: AssistantContext, from: string, to: string, vehicleId: string | undefined, includeUnlinked: boolean) {
  return readAllPages<UsageRow>(
    'part_usage',
    (start, end, withCount) => {
      let q = ctx.db
        .from('part_usage')
        .select('id, vehicle_id, service_id, quantity, unit_cost_at_use, used_at, parts:part_id(name, unit_cost)', withCount ? { count: 'exact' } : undefined)
        .eq('organization_id', ctx.orgId)
        .gte('used_at', from)
        .lte('used_at', to);
      if (vehicleId) q = q.eq('vehicle_id', vehicleId);
      else if (!includeUnlinked) q = q.not('vehicle_id', 'is', null);
      return q.order('used_at', { ascending: true }).order('id', { ascending: true }).range(start, end);
    },
    MAX_ROWS,
  );
}
