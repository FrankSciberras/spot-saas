// roster — who is rostered on which vehicle, for a day or a week.
// Reads rosters + roster_assignments like app/api/rosters/all-shifts/route.ts
// (published rosters overlapping the dates; driver_id + secondary_driver_id per
// vehicle per day). Draft rosters are only mentioned unless asked for: drivers
// can't see them yet, so "who is working" should come from published ones.

import type { AssistantTool } from '../../types';
import { argBool, argEnum, argId, capList, dedupeSources } from '../args';
import { PERIOD_SCHEMA, daysBetween, resolvePeriod } from '../../period';
import { one } from './shifts';

const MAX_DAYS = 31;
const MAX_ENTRIES = 200;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });

// Columns per supabase/saas_install.sql (rosters, roster_assignments) + add_secondary_driver.sql.
interface RosterRow {
  id: string;
  title: string | null;
  week_start: string;
  week_end: string;
  status: 'draft' | 'published';
  published_at: string | null;
}

type NameRel = { full_name: string | null } | { full_name: string | null }[] | null;

interface AssignmentRow {
  roster_id: string;
  assignment_date: string;
  vehicle_id: string;
  driver_id: string | null;
  secondary_driver_id: string | null;
  vehicles: { registration_number: string | null } | { registration_number: string | null }[] | null;
  driver: NameRel;
  second: NameRel;
}

interface Slot {
  date: string;
  vehicle: string;
  driverId: string | null;
  driver: string | null;
  secondId: string | null;
  second: string | null;
  draft: boolean;
}

export const rosterTool: AssistantTool = {
  name: 'roster',
  status: 'Checking the roster…',
  description:
    'The planned roster: which driver (and second driver) is rostered on which vehicle on each day, from PUBLISHED rosters, plus active drivers who are not rostered at all. Draft rosters are only mentioned unless include_drafts is true. Use for "who is working tomorrow", "who is on ABC 123 this week", "when is Joe rostered", "who is off this week". For what actually happened (clock-ins, hours) use shifts_summary instead. Max 31 days per call.',
  parameters: {
    type: 'object',
    properties: {
      period: { ...PERIOD_SCHEMA, description: 'Days to show (default this week). Use "today" / "custom" for a single day.' },
      group_by: { type: 'string', enum: ['day', 'driver', 'vehicle'], description: 'Default day.' },
      driver_id: { type: 'string', description: 'Only this driver (id from find), as main or second driver.' },
      vehicle_id: { type: 'string', description: 'Only this vehicle (id from find).' },
      include_drafts: { type: 'boolean', description: 'Also show unpublished draft rosters (default false).' },
    },
  },
  roles: ['admin', 'staff'],
  module: 'rostering',
  async run(ctx, args) {
    const resolved = resolvePeriod(ctx, args.period, 'this_week');
    const groupBy = argEnum(args, 'group_by', ['day', 'driver', 'vehicle'] as const, 'day');
    const driverId = argId(args, 'driver_id');
    const vehicleId = argId(args, 'vehicle_id');
    const includeDrafts = argBool(args, 'include_drafts');

    const clamped = daysBetween(resolved.from, resolved.to) >= MAX_DAYS;
    const period = clamped ? { ...resolved, to: addDays(resolved.from, MAX_DAYS - 1) } : resolved;

    const { data: rosterData, error } = await ctx.db
      .from('rosters')
      .select('id, title, week_start, week_end, status, published_at')
      .eq('organization_id', ctx.orgId)
      .lte('week_start', period.to)
      .gte('week_end', period.from)
      .order('week_start', { ascending: true })
      .limit(20);
    if (error) throw new Error(`rosters: ${error.message}`);
    const rosters = (rosterData ?? []) as RosterRow[];

    const rosterLinks = [
      { label: 'Rosters', href: '/fleet/rosters' },
      ...rosters.slice(0, 5).map((r) => ({ label: r.title || `Roster ${r.week_start}`, href: `/fleet/rosters/${r.id}` })),
    ];
    if (!rosters.length) {
      return {
        data: { period: period.label, no_roster: 'No roster (published or draft) covers these dates.' },
        sources: rosterLinks.slice(0, 1),
      };
    }

    const drafts = rosters.filter((r) => r.status !== 'published');
    const shownIds = rosters.filter((r) => includeDrafts || r.status === 'published').map((r) => r.id);
    const draftIds = new Set(drafts.map((r) => r.id));

    const [assignRes, draftCountRes] = await Promise.all([
      shownIds.length
        ? (() => {
            let query = ctx.db
              .from('roster_assignments')
              .select(
                'roster_id, assignment_date, vehicle_id, driver_id, secondary_driver_id, vehicles:vehicle_id (registration_number), driver:driver_id (full_name), second:secondary_driver_id (full_name)',
              )
              .eq('organization_id', ctx.orgId)
              .in('roster_id', shownIds)
              .gte('assignment_date', period.from)
              .lte('assignment_date', period.to);
            // Ids are validated UUIDs, safe inside the filter string.
            if (driverId) query = query.or(`driver_id.eq.${driverId},secondary_driver_id.eq.${driverId}`);
            if (vehicleId) query = query.eq('vehicle_id', vehicleId);
            return query.order('assignment_date', { ascending: true }).limit(2000);
          })()
        : null,
      // How much is sitting in drafts we are not showing.
      !includeDrafts && drafts.length
        ? ctx.db
            .from('roster_assignments')
            .select('roster_id', { count: 'exact', head: true })
            .eq('organization_id', ctx.orgId)
            .in('roster_id', [...draftIds])
            .gte('assignment_date', period.from)
            .lte('assignment_date', period.to)
        : null,
    ]);
    if (assignRes?.error) throw new Error(`roster_assignments: ${assignRes.error.message}`);
    if (draftCountRes?.error) throw new Error(`roster_assignments: ${draftCountRes.error.message}`);

    const slots: Slot[] = ((assignRes?.data ?? []) as AssignmentRow[])
      .filter((a) => a.driver_id || a.secondary_driver_id)
      .map((a) => ({
        date: a.assignment_date,
        vehicle: one(a.vehicles)?.registration_number || 'Vehicle',
        driverId: a.driver_id,
        driver: a.driver_id ? one(a.driver)?.full_name || 'Unnamed driver' : null,
        secondId: a.secondary_driver_id,
        second: a.secondary_driver_id ? one(a.second)?.full_name || 'Unnamed driver' : null,
        draft: draftIds.has(a.roster_id),
      }));

    // Compact one-line entries, grouped as asked.
    const people = (s: Slot) => [s.driver, s.second].filter(Boolean).join(' + ');
    const tag = (s: Slot) => (s.draft ? ' (draft)' : '');
    const groups = new Map<string, string[]>();
    const push = (key: string, entry: string) => groups.set(key, [...(groups.get(key) ?? []), entry]);
    for (const s of slots) {
      const when = `${weekday(s.date)} ${s.date}`;
      if (groupBy === 'day') push(when, `${s.vehicle}: ${people(s)}${tag(s)}`);
      else if (groupBy === 'vehicle') push(s.vehicle, `${when}: ${people(s)}${tag(s)}`);
      else {
        if (s.driver && (!driverId || s.driverId === driverId)) push(s.driver, `${when}: ${s.vehicle}${tag(s)}`);
        if (s.second && (!driverId || s.secondId === driverId)) push(s.second, `${when}: ${s.vehicle} (second driver)${tag(s)}`);
      }
    }
    let budget = MAX_ENTRIES;
    let truncated = false;
    const grouped: { [k: string]: string | string[] }[] = [];
    for (const [key, entries] of groups) {
      if (budget <= 0) {
        truncated = true;
        break;
      }
      const kept = entries.slice(0, budget);
      if (kept.length < entries.length) truncated = true;
      budget -= kept.length;
      grouped.push({ [groupBy]: key, rostered: kept });
    }

    // Who is not on the roster(s) shown at all — "who is off this week". Skipped
    // when only drafts exist and they are hidden (everyone would look "off").
    let notRostered: { count: number; names: string[]; truncated: boolean } | undefined;
    if (!driverId && !vehicleId && shownIds.length) {
      const { data: driverData, error: driverError } = await ctx.db
        .from('drivers')
        .select('id, full_name, employment_type')
        .eq('organization_id', ctx.orgId)
        .eq('status', 'active')
        .order('full_name')
        .limit(1000);
      if (driverError) throw new Error(`drivers: ${driverError.message}`);
      const onRoster = new Set(slots.flatMap((s) => [s.driverId, s.secondId]).filter(Boolean));
      const idle = capList(
        ((driverData ?? []) as { id: string; full_name: string | null; employment_type: string | null }[])
          .filter((d) => d.employment_type !== 'terminated' && !onRoster.has(d.id))
          .map((d) => d.full_name || 'Unnamed driver'),
        40,
      );
      notRostered = { count: idle.total, names: idle.items, truncated: idle.truncated };
    }

    const hiddenDrafts = draftCountRes?.count ?? 0;
    return {
      data: {
        period: clamped ? `${period.from} – ${period.to} (cut to ${MAX_DAYS} days)` : period.label,
        rosters: rosters.map((r) => ({
          title: r.title || undefined,
          week: `${r.week_start} – ${r.week_end}`,
          status: r.status,
        })),
        ...(!includeDrafts && drafts.length
          ? {
              drafts_not_shown: `${drafts.length} draft roster(s) with ${hiddenDrafts} assignment(s) in these dates are not published yet (drivers can't see them). Ask with include_drafts to see them.`,
            }
          : {}),
        grouped_by: groupBy,
        rostered_slots: slots.length,
        roster: grouped,
        truncated,
        ...(notRostered ? { active_drivers_not_rostered: notRostered } : {}),
      },
      sources: dedupeSources(rosterLinks).slice(0, 6),
    };
  },
};
