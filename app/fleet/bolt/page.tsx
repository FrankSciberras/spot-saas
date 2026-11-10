import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import FleetIcon from '@/components/fleet/FleetIcon';
import { loadBoltConnection, type BoltConnection } from '@/lib/bolt/sync';
import type { StoredSuspension } from '@/lib/bolt/mapping';
import { fleetClock, type FleetClock } from '@/lib/bolt/timezone';
import {
  RIDE_STAT_COLUMNS,
  acceptanceRate,
  averageFare,
  averageRating,
  faresPerBusyHour,
  summarizeRides,
  type RideStatRow,
  type RideSummary,
  type RideTotals,
} from '@/lib/bolt/stats';
import BoltConnect from './BoltConnect';
import BoltControls from './BoltControls';
import BoltOnlineNow from './BoltOnlineNow';
import BoltDriversTable, { type BoltDriverStat } from './BoltDriversTable';
import BoltTripFilters from './BoltTripFilters';
import styles from './bolt.module.css';

export const dynamic = 'force-dynamic';

/**
 * Operations → Bolt. A fleet's own Bolt account, inside Rovora.
 *
 * Not connected → the connect card. Connected → five tabs that all share one
 * date range:
 *   Overview  headline numbers, who is online now, fares by day
 *   Drivers   per-driver rides, acceptance, fares, tips (+ link to Rovora driver)
 *   Revenue   fares by day and by hour, how riders paid, day-by-day table
 *   Trips     every individual ride offer, filterable and paged
 *   Vehicles  per-car rides and fares, and what Bolt has suspended
 *
 * Data comes from the bolt_* tables (refreshed hourly by /api/cron/bolt-sync),
 * except "online now", which is read live from Bolt.
 *
 * Admin only: this page shows what every driver earned.
 */

type Query = {
  tab?: string;
  range?: string;
  from?: string;
  to?: string;
  status?: string;
  driver?: string;
  page?: string;
};

type Admin = ReturnType<typeof createAdminClient>;

const DAY_MS = 86_400_000;
const MAX_SPAN_DAYS = 92;
const TRIPS_PER_PAGE = 50;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'drivers', label: 'Drivers' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'trips', label: 'Trips' },
  { key: 'vehicles', label: 'Vehicles' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const PRESETS = [
  { key: 'today', label: 'Today', days: 1 },
  { key: '7d', label: '7 days', days: 7 },
  { key: '28d', label: '4 weeks', days: 28 },
] as const;

const TRIP_STATUS_FILTERS: Record<string, string[]> = {
  finished: ['finished'],
  declined: ['driver_rejected', 'driver_did_not_respond'],
  cancelled: ['rider_cancelled', 'rider_did_not_show', 'driver_cancelled_after_accept'],
};

const TRIP_STATUS: Record<string, { label: string; tone: 'ok' | 'bad' | 'muted' }> = {
  finished: { label: 'Finished', tone: 'ok' },
  driver_rejected: { label: 'Declined', tone: 'muted' },
  driver_did_not_respond: { label: 'Missed', tone: 'muted' },
  rider_cancelled: { label: 'Rider cancelled', tone: 'muted' },
  rider_did_not_show: { label: 'Rider no-show', tone: 'bad' },
  driver_cancelled_after_accept: { label: 'Driver cancelled', tone: 'bad' },
};

const PAYMENT_LABEL: Record<string, string> = {
  in_app: 'In-app (card)',
  cash: 'Cash',
  business: 'Bolt Business',
  card_terminal: 'Card terminal',
  other: 'Other',
};

interface BoltDriverRecord {
  bolt_uuid: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  status: string | null;
  suspensions: StoredSuspension[] | null;
  driver_id: string | null;
}

interface BoltVehicleRecord {
  bolt_uuid: string;
  registration_number: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  status: string | null;
  suspensions: StoredSuspension[] | null;
  vehicle_id: string | null;
}

interface Range {
  key: string;
  from: string;
  to: string;
}

interface Attention {
  kind: 'Driver' | 'Vehicle';
  id: string;
  name: string;
  reasons: string[];
}

// --- small helpers ---------------------------------------------------------------

const shiftDay = (day: string, by: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + by * DAY_MS).toISOString().slice(0, 10);

/** "Today" in the fleet's own city (not the server's), as YYYY-MM-DD. */
function fleetToday(utcOffsetMinutes: number | null): string {
  return new Date(Date.now() + (utcOffsetMinutes ?? 0) * 60_000).toISOString().slice(0, 10);
}

/** Works out the inclusive [from, to] days to show, in the fleet's own calendar. */
function resolveRange(sp: Query, today: string): Range {
  if (sp.range === 'custom' && sp.from && sp.to && ISO_DAY.test(sp.from) && ISO_DAY.test(sp.to)) {
    let from = sp.from <= sp.to ? sp.from : sp.to;
    const to = sp.from <= sp.to ? sp.to : sp.from;
    // Keep the page fast: anything longer is trimmed to the most recent 92 days.
    if (Date.parse(to) - Date.parse(from) > (MAX_SPAN_DAYS - 1) * DAY_MS) from = shiftDay(to, -(MAX_SPAN_DAYS - 1));
    return { key: 'custom', from, to };
  }
  const preset = PRESETS.find((p) => p.key === sp.range) ?? PRESETS[1];
  return { key: preset.key, from: shiftDay(today, -(preset.days - 1)), to: today };
}

/** The query string for a tab + period (+ any extras), leaving out defaults. */
function queryFor(tab: TabKey, range: Range, extra: Record<string, string | undefined> = {}): Record<string, string> {
  const q: Record<string, string> = {};
  if (tab !== 'overview') q.tab = tab;
  if (range.key === 'custom') {
    q.range = 'custom';
    q.from = range.from;
    q.to = range.to;
  } else if (range.key !== '7d') {
    q.range = range.key;
  }
  for (const [k, v] of Object.entries(extra)) if (v) q[k] = v;
  return q;
}

const hrefFor = (tab: TabKey, range: Range, extra?: Record<string, string | undefined>) => {
  const qs = new URLSearchParams(queryFor(tab, range, extra)).toString();
  return qs ? `/fleet/bolt?${qs}` : '/fleet/bolt';
};

function ago(iso: string | null): string {
  if (!iso) return 'not yet';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

const dayLabel = (day: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });

const int = (n: number) => Math.round(n).toLocaleString('en-GB');

function hoursText(seconds: number): string {
  if (seconds <= 0) return '—';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return h >= 20 ? `${Math.round(mins / 60)} h` : `${h} h ${mins % 60} m`;
}

const driverName = (d: BoltDriverRecord) =>
  [d.first_name, d.last_name].filter(Boolean).join(' ') || d.display_name || 'Unnamed driver';

const vehicleModel = (v: BoltVehicleRecord) => [v.make, v.model, v.year].filter(Boolean).join(' ');

/** "Document expired — transport operator licence", de-duplicated. */
function reasonList(suspensions: StoredSuspension[] | null): string[] {
  const seen = new Set<string>();
  for (const s of suspensions ?? []) {
    const doc = s.document ? s.document.replace(/_/g, ' ') : '';
    seen.add(doc ? `${s.type} — ${doc}` : s.type);
  }
  return [...seen];
}

/** All ride rows for the period. Supabase returns 1,000 rows a request, so page through. */
async function loadRides(admin: Admin, orgId: string, from: string, to: string): Promise<RideStatRow[]> {
  const page = (start: number) =>
    admin
      .from('bolt_rides')
      .select(RIDE_STAT_COLUMNS, start === 0 ? { count: 'exact' } : undefined)
      .eq('organization_id', orgId)
      .gte('local_day', from)
      .lte('local_day', to)
      .order('requested_at', { ascending: true })
      .order('order_reference', { ascending: true })
      .range(start, start + 999);

  const first = await page(0);
  const rows = ((first.data ?? []) as unknown as RideStatRow[]).slice();
  const total = first.count ?? rows.length;

  const starts: number[] = [];
  for (let s = 1000; s < total; s += 1000) starts.push(s);
  const rest = await Promise.all(starts.map((s) => page(s)));
  for (const r of rest) rows.push(...((r.data ?? []) as unknown as RideStatRow[]));
  return rows;
}

// --- page ------------------------------------------------------------------------

export default async function FleetBoltPage({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await requireRole(['admin']);
  const orgId = user.organization_id;
  const sp = await searchParams;

  const admin = createAdminClient();
  const conn = await loadBoltConnection(admin, orgId);

  return (
    <FleetShell user={user} title="Bolt">
      <div className={styles.container}>
        <div className={`${styles.header} header-mobile-row`}>
          <div>
            <div className={styles.breadcrumb}>Operations / Bolt</div>
            <div className={styles.titleRow}>
              <h1 className={styles.title}>Bolt</h1>
            </div>
            <p className={styles.subtitle}>
              {conn
                ? 'Your Bolt fleet account, inside Rovora — rides, fares and driver activity, refreshed every hour.'
                : 'Bring your Bolt fleet account into Rovora: rides, fares, tips and driver activity in one place.'}
            </p>
          </div>
          {conn && conn.status === 'connected' && <BoltControls />}
        </div>

        {!conn ? <BoltConnect /> : <Connected conn={conn} orgId={orgId} sp={sp} />}
      </div>
    </FleetShell>
  );
}

async function Connected({ conn, orgId, sp }: { conn: BoltConnection; orgId: string; sp: Query }) {
  const admin = createAdminClient();

  const today = fleetToday(conn.utc_offset_minutes);
  const range = resolveRange(sp, today);
  const tab: TabKey = TABS.find((t) => t.key === sp.tab)?.key ?? 'overview';
  const clock = fleetClock(conn.country_code, conn.utc_offset_minutes);

  // The Trips tab lists individual rides and needs none of the roll-ups, so it
  // skips loading the whole period's rows.
  const [rides, boltDriversRes, boltVehiclesRes, rovoraDriversRes] = await Promise.all([
    tab === 'trips' ? Promise.resolve([] as RideStatRow[]) : loadRides(admin, orgId, range.from, range.to),
    admin
      .from('bolt_drivers')
      .select('bolt_uuid, first_name, last_name, display_name, status, suspensions, driver_id')
      .eq('organization_id', orgId)
      .range(0, 4999),
    admin
      .from('bolt_vehicles')
      .select('bolt_uuid, registration_number, make, model, year, status, suspensions, vehicle_id')
      .eq('organization_id', orgId)
      .range(0, 4999),
    tab === 'drivers'
      ? admin.from('drivers').select('id, full_name').eq('organization_id', orgId).order('full_name').range(0, 4999)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ]);

  const boltDrivers = (boltDriversRes.data ?? []) as BoltDriverRecord[];
  const boltVehicles = (boltVehiclesRes.data ?? []) as BoltVehicleRecord[];
  const rovoraDrivers = ((rovoraDriversRes.data ?? []) as { id: string; full_name: string | null }[]).map((d) => ({
    id: d.id,
    name: d.full_name || 'Unnamed driver',
  }));

  const summary = summarizeRides(rides, range.from, range.to, clock.hour);
  const money = new Intl.NumberFormat('en-MT', { style: 'currency', currency: summary.currency });
  const money0 = new Intl.NumberFormat('en-MT', { style: 'currency', currency: summary.currency, maximumFractionDigits: 0 });

  // ---- per-driver rows: everyone active on Bolt, plus anyone with rides -------
  const knownDrivers = new Map(boltDrivers.map((d) => [d.bolt_uuid, d]));
  const driverStats: BoltDriverStat[] = [];
  for (const d of boltDrivers) {
    const s = summary.byDriver.get(d.bolt_uuid);
    if (!s && d.status !== 'active') continue; // inactive and idle → not worth a row
    driverStats.push(toDriverStat(d.bolt_uuid, driverName(d), d.status, d.driver_id, s));
  }
  for (const [uuid, s] of summary.byDriver) {
    if (!knownDrivers.has(uuid)) driverStats.push(toDriverStat(uuid, 'Former driver', null, null, s));
  }

  // ---- things Bolt has suspended ----------------------------------------------
  const suspendedDrivers: Attention[] = boltDrivers
    .filter((d) => d.status === 'suspended' && (d.suspensions?.length ?? 0) > 0)
    .map((d) => ({ kind: 'Driver', id: `d-${d.bolt_uuid}`, name: driverName(d), reasons: reasonList(d.suspensions) }));
  const suspendedVehicles: Attention[] = boltVehicles
    .filter((v) => v.status === 'suspended' && (v.suspensions?.length ?? 0) > 0)
    .map((v) => ({
      kind: 'Vehicle',
      id: `v-${v.bolt_uuid}`,
      name: [v.registration_number, vehicleModel(v)].filter(Boolean).join(' · '),
      reasons: reasonList(v.suspensions),
    }));

  const periodText =
    range.from === range.to
      ? dayLabel(range.from, { weekday: 'long', day: 'numeric', month: 'long' })
      : `${dayLabel(range.from, { day: 'numeric', month: 'short' })} – ${dayLabel(range.to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const historyStart = conn.rides_synced_from ? conn.rides_synced_from.slice(0, 10) : null;

  // Changing the period on the Trips tab keeps its status / driver filter.
  const tripFilters: { status?: string; driver?: string } =
    tab === 'trips'
      ? {
          status: sp.status && TRIP_STATUS_FILTERS[sp.status] ? sp.status : undefined,
          driver: boltDrivers.some((d) => d.bolt_uuid === sp.driver) ? sp.driver : undefined,
        }
      : {};

  return (
    <>
      {/* ── Connection strip ── */}
      <div className={styles.connStrip} data-status={conn.status}>
        <div className={styles.boltLogo} aria-hidden>b</div>
        <div className={styles.connInfo}>
          <div className={styles.connName}>
            {conn.company_name || `Bolt company ${conn.company_id}`}
            {conn.city_name ? <span className={styles.connCity}> · {conn.city_name}</span> : null}
          </div>
          <div className={styles.connMeta}>
            {conn.status === 'connected' ? (
              <>
                <span className={styles.chipOk}>Connected</span>
                Last updated {ago(conn.last_synced_at)} · refreshes every hour
              </>
            ) : (
              <>
                <span className={styles.chipBad}>Needs attention</span>
                Last updated {ago(conn.last_synced_at)}
              </>
            )}
          </div>
        </div>
      </div>

      {conn.status === 'error' && (
        <>
          <div className={styles.error}>
            {conn.last_error || 'Bolt refused the saved API key.'} The numbers below are from the last successful
            update.
          </div>
          <BoltConnect reconnect />
        </>
      )}

      {/* ── Tabs ── */}
      <nav className={styles.tabs} aria-label="Bolt sections">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={hrefFor(t.key, range)}
            className={styles.tab}
            data-active={tab === t.key ? 'true' : undefined}
            aria-current={tab === t.key ? 'page' : undefined}
            scroll={false}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {/* ── Period (shared by every tab) ── */}
      <div className={styles.rangeBar}>
        <div className={styles.rangeTabs}>
          {PRESETS.map((p) => (
            <Link
              key={p.key}
              href={hrefFor(tab, { key: p.key, from: '', to: '' }, tripFilters)}
              className={styles.rangeTab}
              data-active={range.key === p.key ? 'true' : undefined}
              scroll={false}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <form className={styles.rangeForm} action="/fleet/bolt" method="get">
          {tab !== 'overview' && <input type="hidden" name="tab" value={tab} />}
          {tripFilters.status && <input type="hidden" name="status" value={tripFilters.status} />}
          {tripFilters.driver && <input type="hidden" name="driver" value={tripFilters.driver} />}
          <input type="hidden" name="range" value="custom" />
          <input className={styles.dateInput} type="date" name="from" defaultValue={range.from} max={today} aria-label="From" />
          <span className={styles.rangeDash}>–</span>
          <input className={styles.dateInput} type="date" name="to" defaultValue={range.to} max={today} aria-label="To" />
          <button className={styles.ghostBtn} type="submit" data-active={range.key === 'custom' ? 'true' : undefined}>
            Show
          </button>
        </form>
      </div>
      <p className={styles.periodText}>
        {periodText}
        {historyStart && range.from < historyStart ? (
          <span className={styles.periodWarn}>
            {' '}· Ride history is imported from {dayLabel(historyStart, { day: 'numeric', month: 'short', year: 'numeric' })}, so earlier days show as empty.
          </span>
        ) : null}
      </p>

      {tab === 'overview' && (
        <OverviewTab
          summary={summary}
          range={range}
          money={money}
          money0={money0}
          live={conn.status === 'connected'}
          driverStats={driverStats}
          attention={[...suspendedDrivers, ...suspendedVehicles]}
        />
      )}

      {tab === 'drivers' && (
        <DriversTab
          summary={summary}
          money={money}
          driverStats={driverStats}
          rovoraDrivers={rovoraDrivers}
          suspended={suspendedDrivers}
        />
      )}

      {tab === 'revenue' && <RevenueTab summary={summary} money={money} money0={money0} />}

      {tab === 'trips' && (
        <TripsTab
          admin={admin}
          orgId={orgId}
          range={range}
          sp={sp}
          clock={clock}
          drivers={boltDrivers}
        />
      )}

      {tab === 'vehicles' && (
        <VehiclesTab summary={summary} money={money} vehicles={boltVehicles} suspended={suspendedVehicles} />
      )}
    </>
  );
}

// --- Overview ----------------------------------------------------------------------

function OverviewTab({
  summary,
  range,
  money,
  money0,
  live,
  driverStats,
  attention,
}: {
  summary: RideSummary;
  range: Range;
  money: Intl.NumberFormat;
  money0: Intl.NumberFormat;
  live: boolean;
  driverStats: BoltDriverStat[];
  attention: Attention[];
}) {
  const t = summary.totals;
  const acceptance = acceptanceRate(t);
  const perHour = faresPerBusyHour(t);
  const rating = averageRating(t);
  const avgFare = averageFare(t);
  const top = [...driverStats].filter((d) => d.finished > 0).sort((a, b) => b.fares - a.fares).slice(0, 5);
  const topFares = Math.max(1, ...top.map((d) => d.fares));

  return (
    <>
      <div className={styles.kpis}>
        <Kpi label="Finished rides" value={int(t.finished)} sub={`of ${int(t.offers)} offered`} />
        <Kpi label="Ride fares" value={money0.format(t.fares)} sub="before Bolt’s commission" />
        <Kpi label="Tips" value={money.format(t.tips)} sub={t.finished ? `${money.format(t.tips / t.finished)} per ride` : ' '} />
        <Kpi
          label="Acceptance"
          value={acceptance == null ? '—' : `${Math.round(acceptance * 100)}%`}
          sub={`${int(t.declined)} offers declined`}
        />
        <Kpi label="Average fare" value={avgFare == null ? '—' : money.format(avgFare)} sub={`${int(t.tripKm)} km carried`} />
        <Kpi
          label="Fares per hour"
          value={perHour == null ? '—' : money.format(perHour)}
          sub={`${int(t.busySeconds / 3600)} h on jobs`}
        />
        <Kpi
          label="Cash collected"
          value={money0.format(t.cashFares)}
          sub={t.fares ? `${Math.round((t.cashFares / t.fares) * 100)}% of fares` : ' '}
        />
        <Kpi label="Rider rating" value={rating == null ? '—' : rating.toFixed(2)} sub={`${int(t.ratingCount)} ratings`} />
      </div>

      {live && <BoltOnlineNow />}

      <DayChart summary={summary} money={money} money0={money0} />

      <div className={styles.split}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Top drivers</h2>
            <Link className={styles.panelLink} href={hrefFor('drivers', range)} scroll={false}>
              All drivers →
            </Link>
          </div>
          {top.length === 0 ? (
            <div className={styles.panelEmpty}>No finished rides in this period.</div>
          ) : (
            <ul className={styles.breakdown}>
              {top.map((d) => (
                <li key={d.uuid}>
                  <div className={styles.bdTop}>
                    <span>{d.name}</span>
                    <span className={styles.bdNums}>
                      {int(d.finished)} rides · {money0.format(d.fares)}
                    </span>
                  </div>
                  <div className={styles.bdTrack}>
                    <div className={styles.bdFill} style={{ width: `${(d.fares / topFares) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Suspended on Bolt</h2>
            <span className={styles.panelMeta}>{attention.length ? `${attention.length} need attention` : 'All clear'}</span>
          </div>
          <AttentionList items={attention.slice(0, 5)} emptyText="No drivers or vehicles are suspended on Bolt." />
          {attention.length > 5 && (
            <p className={styles.footNote}>
              And {attention.length - 5} more — see the{' '}
              <Link className={styles.inlineLink} href={hrefFor('drivers', range)} scroll={false}>Drivers</Link> and{' '}
              <Link className={styles.inlineLink} href={hrefFor('vehicles', range)} scroll={false}>Vehicles</Link> tabs.
            </p>
          )}
        </section>
      </div>
    </>
  );
}

// --- Drivers -----------------------------------------------------------------------

function DriversTab({
  summary,
  money,
  driverStats,
  rovoraDrivers,
  suspended,
}: {
  summary: RideSummary;
  money: Intl.NumberFormat;
  driverStats: BoltDriverStat[];
  rovoraDrivers: { id: string; name: string }[];
  suspended: Attention[];
}) {
  const t = summary.totals;
  const working = summary.byDriver.size;
  const acceptance = acceptanceRate(t);
  const perHour = faresPerBusyHour(t);
  const linked = driverStats.filter((d) => d.linkedDriverId).length;

  return (
    <>
      <div className={styles.kpis}>
        <Kpi label="Drivers with rides" value={int(working)} sub={`${int(driverStats.length)} listed below`} />
        <Kpi
          label="Fares per driver"
          value={working ? money.format(t.fares / working) : '—'}
          sub={working ? `${int(t.finished / working)} rides each on average` : ' '}
        />
        <Kpi
          label="Acceptance"
          value={acceptance == null ? '—' : `${Math.round(acceptance * 100)}%`}
          sub={`${int(t.declined)} offers declined`}
        />
        <Kpi label="Fares per hour" value={perHour == null ? '—' : money.format(perHour)} sub="while on jobs" />
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Drivers</h2>
          <span className={styles.panelMeta}>
            {linked} of {driverStats.length} linked to a Rovora driver · click a heading to sort
          </span>
        </div>
        {driverStats.length === 0 ? (
          <div className={styles.panelEmpty}>No Bolt drivers yet. Press “Sync now” to import them.</div>
        ) : (
          <BoltDriversTable rows={driverStats} rovoraDrivers={rovoraDrivers} currency={summary.currency} />
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Drivers suspended on Bolt</h2>
          <span className={styles.panelMeta}>{suspended.length ? `${suspended.length} can’t take rides` : 'All clear'}</span>
        </div>
        <AttentionList items={suspended} emptyText="None of your drivers are suspended on Bolt." />
      </section>
    </>
  );
}

// --- Revenue -----------------------------------------------------------------------

function RevenueTab({
  summary,
  money,
  money0,
}: {
  summary: RideSummary;
  money: Intl.NumberFormat;
  money0: Intl.NumberFormat;
}) {
  const t = summary.totals;
  const days = summary.byDay.length || 1;
  const inApp = t.fares - t.cashFares;
  const maxHourFares = Math.max(1, ...summary.byHour.map((h) => h.fares));
  const peak = summary.byHour.reduce((best, h) => (h.fares > best.fares ? h : best), summary.byHour[0]);
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

  return (
    <>
      <div className={styles.kpis}>
        <Kpi label="Ride fares" value={money.format(t.fares)} sub="before Bolt’s commission" />
        <Kpi label="Tips" value={money.format(t.tips)} sub="on top of fares" />
        <Kpi
          label="Paid in-app"
          value={money.format(inApp)}
          sub={t.fares ? `${Math.round((inApp / t.fares) * 100)}% — paid out by Bolt` : ' '}
        />
        <Kpi
          label="Cash collected"
          value={money.format(t.cashFares)}
          sub={t.fares ? `${Math.round((t.cashFares / t.fares) * 100)}% — already with drivers` : ' '}
        />
        <Kpi label="Average per day" value={money.format(t.fares / days)} sub={`${int(t.finished / days)} rides a day`} />
        <Kpi
          label="Average fare"
          value={t.finished ? money.format(t.fares / t.finished) : '—'}
          sub={t.tripKm > 0 ? `${money.format(t.fares / t.tripKm)} per km` : ' '}
        />
        <Kpi label="Cancellation fees" value={money.format(t.cancellationFees)} sub="not included in fares" />
        <Kpi label="Fares + tips" value={money.format(t.fares + t.tips)} sub="total riders paid" />
      </div>

      <DayChart summary={summary} money={money} money0={money0} />

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Busiest hours</h2>
          <span className={styles.panelMeta}>
            {peak && peak.fares > 0
              ? `Peak: ${hh(peak.hour)}–${hh((peak.hour + 1) % 24)} · ${money0.format(peak.fares)} over the period`
              : 'By the hour a ride was requested'}
          </span>
        </div>
        <div className={styles.chart}>
          {summary.byHour.map((h) => (
            <div
              className={styles.bar}
              key={h.hour}
              title={`${hh(h.hour)}–${hh((h.hour + 1) % 24)}: ${money.format(h.fares)} · ${h.finished} rides (${h.offers} offered)`}
            >
              <div
                className={styles.barFill}
                data-peak={peak && h.hour === peak.hour && h.fares > 0 ? 'true' : undefined}
                style={{ height: `${Math.max(h.fares > 0 ? 3 : 0, (h.fares / maxHourFares) * 100)}%` }}
              />
              <span className={styles.barLabel}>{h.hour % 3 === 0 ? String(h.hour).padStart(2, '0') : ''}</span>
            </div>
          ))}
        </div>
      </section>

      <div className={styles.split}>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>How riders paid</h2>
          </div>
          <Breakdown rows={summary.byPayment} total={t.finished} label={(k) => PAYMENT_LABEL[k] ?? k} money={money0} />
        </section>
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Ride types</h2>
          </div>
          <Breakdown rows={summary.byCategory} total={t.finished} label={(k) => k} money={money0} />
        </section>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Day by day</h2>
          <span className={styles.panelMeta}>Newest first</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.thName}>Day</th>
                <th>Offered</th>
                <th>Finished</th>
                <th>Fares</th>
                <th>Tips</th>
                <th>Average fare</th>
              </tr>
            </thead>
            <tbody>
              {[...summary.byDay].reverse().map((d) => (
                <tr key={d.day} data-quiet={d.finished === 0 ? 'true' : undefined}>
                  <td className={styles.tdName}>
                    <span className={styles.driverName}>
                      {dayLabel(d.day, { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                  </td>
                  <td>{int(d.offers)}</td>
                  <td>{int(d.finished)}</td>
                  <td className={styles.strong}>{d.finished ? money.format(d.fares) : '—'}</td>
                  <td>{d.tips ? money.format(d.tips) : '—'}</td>
                  <td>{d.finished ? money.format(d.fares / d.finished) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className={styles.footNote}>
        Fares are what riders paid for finished rides, before Bolt takes its commission — Bolt doesn&rsquo;t share
        commission or payout figures through its API yet, so use your Bolt payout report for settlements.
      </p>
    </>
  );
}

// --- Trips -------------------------------------------------------------------------

interface TripRow {
  order_reference: string;
  status: string;
  ride_type: string | null;
  category_name: string | null;
  payment_method: string | null;
  requested_at: string;
  driver_uuid: string | null;
  vehicle_reg: string | null;
  currency: string | null;
  price_total: number | null;
  tip: number | null;
  cancellation_fee: number | null;
  ride_duration_seconds: number | null;
  trip_distance_km: number | null;
  rating: number | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  driver_cancelled_reason: string | null;
  rider_cancelled_reason: string | null;
}

async function TripsTab({
  admin,
  orgId,
  range,
  sp,
  clock,
  drivers,
}: {
  admin: Admin;
  orgId: string;
  range: Range;
  sp: Query;
  clock: FleetClock;
  drivers: BoltDriverRecord[];
}) {
  const status = sp.status && TRIP_STATUS_FILTERS[sp.status] ? sp.status : 'all';
  const driver = drivers.some((d) => d.bolt_uuid === sp.driver) ? (sp.driver as string) : '';
  const page = Math.max(1, Math.min(10_000, Number.parseInt(sp.page ?? '1', 10) || 1));
  const start = (page - 1) * TRIPS_PER_PAGE;

  let query = admin
    .from('bolt_rides')
    .select(
      'order_reference, status, ride_type, category_name, payment_method, requested_at, driver_uuid, vehicle_reg, currency, price_total, tip, cancellation_fee, ride_duration_seconds, trip_distance_km, rating, pickup_address, dropoff_address, driver_cancelled_reason, rider_cancelled_reason',
      { count: 'exact' },
    )
    .eq('organization_id', orgId)
    .gte('local_day', range.from)
    .lte('local_day', range.to);
  if (status !== 'all') query = query.in('status', TRIP_STATUS_FILTERS[status]);
  if (driver) query = query.eq('driver_uuid', driver);

  const { data, count } = await query
    .order('requested_at', { ascending: false })
    .order('order_reference', { ascending: true })
    .range(start, start + TRIPS_PER_PAGE - 1);

  const trips = (data ?? []) as unknown as TripRow[];
  const total = count ?? trips.length;
  const pages = Math.max(1, Math.ceil(total / TRIPS_PER_PAGE));
  const names = new Map(drivers.map((d) => [d.bolt_uuid, driverName(d)]));
  const money = new Intl.NumberFormat('en-MT', { style: 'currency', currency: trips[0]?.currency || 'EUR' });

  const filters = { status: status === 'all' ? undefined : status, driver: driver || undefined };
  const pageHref = (p: number) => hrefFor('trips', range, { ...filters, page: p > 1 ? String(p) : undefined });

  const driverOptions = drivers
    .filter((d) => d.status !== 'deactivated' || d.bolt_uuid === driver)
    .map((d) => ({ uuid: d.bolt_uuid, name: driverName(d) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Trips</h2>
        <span className={styles.panelMeta}>
          {total === 0
            ? 'Nothing matches'
            : `${int(start + 1)}–${int(Math.min(start + TRIPS_PER_PAGE, total))} of ${int(total)} · newest first`}
        </span>
      </div>

      <BoltTripFilters params={queryFor('trips', range)} status={status} driver={driver} drivers={driverOptions} />

      {trips.length === 0 ? (
        <div className={styles.panelEmpty}>No trips for this period and filter.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={`${styles.table} ${styles.tripsTable}`}>
            <thead>
              <tr>
                <th className={styles.thName}>When</th>
                <th className={styles.tl}>Driver</th>
                <th className={styles.tl}>Route</th>
                <th className={styles.tl}>Outcome</th>
                <th>Trip</th>
                <th>Fare</th>
                <th className={styles.tl}>Paid by</th>
                <th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((r) => {
                const st = TRIP_STATUS[r.status] ?? { label: r.status.replace(/_/g, ' '), tone: 'muted' as const };
                const reason = (r.driver_cancelled_reason || r.rider_cancelled_reason || '').replace(/_/g, ' ');
                const finished = r.status === 'finished';
                const fee = Number(r.cancellation_fee ?? 0);
                return (
                  <tr key={r.order_reference}>
                    <td className={styles.tdName}>
                      <span className={styles.driverName}>{clock.time(r.requested_at)}</span>
                      <div className={styles.cellSub}>{clock.day(r.requested_at)}</div>
                    </td>
                    <td className={styles.tl}>
                      {(r.driver_uuid && names.get(r.driver_uuid)) || 'Former driver'}
                      <div className={styles.cellSub}>{r.vehicle_reg || '—'}</div>
                    </td>
                    <td className={`${styles.tl} ${styles.routeCell}`}>
                      <div className={styles.routeLine} title={r.pickup_address ?? undefined}>
                        {r.pickup_address || 'Pickup not recorded'}
                      </div>
                      <div className={`${styles.routeLine} ${styles.cellSub}`} title={r.dropoff_address ?? undefined}>
                        → {r.dropoff_address || 'Drop-off not recorded'}
                      </div>
                    </td>
                    <td className={styles.tl}>
                      <span className={styles.tripChip} data-tone={st.tone}>{st.label}</span>
                      {(reason || r.category_name) && (
                        <div className={styles.cellSub}>
                          {[r.category_name, r.ride_type === 'scheduled' ? 'scheduled' : '', reason].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </td>
                    <td>
                      {finished && r.trip_distance_km != null ? `${Number(r.trip_distance_km).toFixed(1)} km` : '—'}
                      {finished && r.ride_duration_seconds ? (
                        <div className={styles.cellSub}>{Math.round(r.ride_duration_seconds / 60)} min</div>
                      ) : null}
                    </td>
                    <td className={finished ? styles.strong : undefined}>
                      {finished ? money.format(Number(r.price_total ?? 0)) : fee > 0 ? money.format(fee) : '—'}
                      {finished && Number(r.tip ?? 0) > 0 ? (
                        <div className={styles.cellSub}>+ {money.format(Number(r.tip))} tip</div>
                      ) : !finished && fee > 0 ? (
                        <div className={styles.cellSub}>cancellation fee</div>
                      ) : null}
                    </td>
                    <td className={styles.tl}>{finished ? (PAYMENT_LABEL[r.payment_method ?? ''] ?? '—') : '—'}</td>
                    <td>{r.rating != null ? `${Number(r.rating).toFixed(0)} ★` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className={styles.pager}>
          {page > 1 ? (
            <Link className={styles.ghostBtn} href={pageHref(page - 1)} scroll={false}>← Newer</Link>
          ) : (
            <span className={styles.ghostBtn} aria-disabled="true">← Newer</span>
          )}
          <span className={styles.pagerText}>Page {int(page)} of {int(pages)}</span>
          {page < pages ? (
            <Link className={styles.ghostBtn} href={pageHref(page + 1)} scroll={false}>Older →</Link>
          ) : (
            <span className={styles.ghostBtn} aria-disabled="true">Older →</span>
          )}
        </div>
      )}
    </section>
  );
}

// --- Vehicles ----------------------------------------------------------------------

function VehiclesTab({
  summary,
  money,
  vehicles,
  suspended,
}: {
  summary: RideSummary;
  money: Intl.NumberFormat;
  vehicles: BoltVehicleRecord[];
  suspended: Attention[];
}) {
  const known = new Set(vehicles.map((v) => v.bolt_uuid));
  const rows: { id: string; reg: string; model: string; status: string | null; inRovora: boolean | null; s?: RideTotals }[] = [];

  for (const v of vehicles) {
    const s = summary.byVehicle.get(v.bolt_uuid);
    if (!s && v.status === 'deactivated') continue; // long gone and idle → not worth a row
    rows.push({
      id: v.bolt_uuid,
      reg: v.registration_number || '—',
      model: vehicleModel(v),
      status: v.status,
      inRovora: Boolean(v.vehicle_id),
      s,
    });
  }
  for (const [uuid, s] of summary.byVehicle) {
    if (!known.has(uuid)) rows.push({ id: uuid, reg: 'Removed vehicle', model: '', status: null, inRovora: null, s });
  }
  rows.sort((a, b) => (b.s?.fares ?? -1) - (a.s?.fares ?? -1) || a.reg.localeCompare(b.reg));

  const working = summary.byVehicle.size;
  const t = summary.totals;
  const active = vehicles.filter((v) => v.status === 'active').length;
  const best = rows.find((r) => (r.s?.fares ?? 0) > 0);

  return (
    <>
      <div className={styles.kpis}>
        <Kpi label="Cars with rides" value={int(working)} sub={`${int(active)} active on Bolt`} />
        <Kpi
          label="Fares per car"
          value={working ? money.format(t.fares / working) : '—'}
          sub={working ? `${int(t.finished / working)} rides each on average` : ' '}
        />
        <Kpi label="Best earner" value={best ? best.reg : '—'} sub={best?.s ? money.format(best.s.fares) : ' '} />
        <Kpi
          label="Idle cars"
          value={int(Math.max(0, active - working))}
          sub="active on Bolt, no rides this period"
        />
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Vehicles</h2>
          <span className={styles.panelMeta}>Highest fares first</span>
        </div>
        {rows.length === 0 ? (
          <div className={styles.panelEmpty}>No Bolt vehicles yet. Press “Sync now” to import them.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.thName}>Vehicle</th>
                  <th title="Finished rides (of all rides offered)">Rides</th>
                  <th title="What riders paid, before Bolt’s commission">Fares</th>
                  <th>Tips</th>
                  <th title="Distance carrying riders">Distance</th>
                  <th title="Time driving to pickups and carrying riders">On jobs</th>
                  <th title="Fares per hour spent on jobs">Per hour</th>
                  <th className={styles.thLink} title="Whether this car also exists in your Rovora vehicle list (matched on plate)">
                    In Rovora
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const perHour = r.s ? faresPerBusyHour(r.s) : null;
                  return (
                    <tr key={r.id} data-quiet={!r.s ? 'true' : undefined}>
                      <td className={styles.tdName}>
                        <span className={styles.driverName}>{r.reg}</span>
                        {r.status && r.status !== 'active' && (
                          <span className={styles.statusChip} data-status={r.status}>
                            {r.status === 'suspended' ? 'Suspended' : 'Deactivated'}
                          </span>
                        )}
                        {r.model && <div className={styles.cellSub}>{r.model}</div>}
                      </td>
                      <td>
                        {int(r.s?.finished ?? 0)}
                        <span className={styles.sub}> / {int(r.s?.offers ?? 0)}</span>
                      </td>
                      <td className={styles.strong}>{r.s?.finished ? money.format(r.s.fares) : '—'}</td>
                      <td>{r.s?.tips ? money.format(r.s.tips) : '—'}</td>
                      <td>{r.s?.tripKm ? `${int(r.s.tripKm)} km` : '—'}</td>
                      <td>{hoursText(r.s?.busySeconds ?? 0)}</td>
                      <td>{perHour == null ? '—' : money.format(perHour)}</td>
                      <td className={styles.tdLink}>
                        {r.inRovora == null ? '—' : r.inRovora ? (
                          <span className={styles.yes}>
                            <FleetIcon name="check" size={13} stroke={2.2} /> Yes
                          </span>
                        ) : (
                          <span className={styles.sub}>Not yet</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Vehicles suspended on Bolt</h2>
          <span className={styles.panelMeta}>{suspended.length ? `${suspended.length} can’t take rides` : 'All clear'}</span>
        </div>
        <AttentionList items={suspended} emptyText="None of your vehicles are suspended on Bolt." />
      </section>
    </>
  );
}

// --- shared pieces -----------------------------------------------------------------

function toDriverStat(
  uuid: string,
  name: string,
  status: string | null,
  linkedDriverId: string | null,
  s: RideTotals | undefined,
): BoltDriverStat {
  return {
    uuid,
    name,
    status,
    linkedDriverId,
    offers: s?.offers ?? 0,
    finished: s?.finished ?? 0,
    acceptance: s ? acceptanceRate(s) : null,
    fares: s?.fares ?? 0,
    tips: s?.tips ?? 0,
    cash: s?.cashFares ?? 0,
    busySeconds: s?.busySeconds ?? 0,
    perHour: s ? faresPerBusyHour(s) : null,
    rating: s ? averageRating(s) : null,
  };
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className={styles.kpi}>
      <span className={styles.kpiLabel}>{label}</span>
      <span className={styles.kpiValue}>{value}</span>
      <span className={styles.kpiSub}>{sub}</span>
    </div>
  );
}

function DayChart({
  summary,
  money,
  money0,
}: {
  summary: RideSummary;
  money: Intl.NumberFormat;
  money0: Intl.NumberFormat;
}) {
  const span = summary.byDay.length;
  if (span <= 1) return null;
  const max = Math.max(1, ...summary.byDay.map((d) => d.fares));
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Fares by day</h2>
        <span className={styles.panelMeta}>{money0.format(summary.totals.fares / span)} a day on average</span>
      </div>
      <div className={styles.chart} data-dense={span > 35 ? 'true' : undefined}>
        {summary.byDay.map((d) => (
          <div
            className={styles.bar}
            key={d.day}
            title={`${dayLabel(d.day, { weekday: 'short', day: 'numeric', month: 'short' })}: ${money.format(d.fares)} · ${d.finished} rides`}
          >
            <div className={styles.barFill} style={{ height: `${Math.max(d.fares > 0 ? 3 : 0, (d.fares / max) * 100)}%` }} />
            {span <= 35 && <span className={styles.barLabel}>{Number(d.day.slice(8))}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

function AttentionList({ items, emptyText }: { items: Attention[]; emptyText: string }) {
  if (items.length === 0) {
    return (
      <div className={styles.panelEmpty}>
        <FleetIcon name="check" size={18} stroke={2} /> {emptyText}
      </div>
    );
  }
  return (
    <ul className={styles.attention}>
      {items.map((a) => (
        <li key={a.id}>
          <span className={styles.attnKind}>{a.kind}</span>
          <div>
            <div className={styles.attnName}>{a.name}</div>
            <div className={styles.attnReasons}>{a.reasons.join(' · ')}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Breakdown({
  rows,
  total,
  label,
  money,
}: {
  rows: { key: string; rides: number; fares: number }[];
  total: number;
  label: (key: string) => string;
  money: Intl.NumberFormat;
}) {
  if (rows.length === 0) return <div className={styles.panelEmpty}>No finished rides in this period.</div>;
  return (
    <ul className={styles.breakdown}>
      {rows.map((r) => {
        const pct = total > 0 ? (r.rides / total) * 100 : 0;
        return (
          <li key={r.key}>
            <div className={styles.bdTop}>
              <span>{label(r.key)}</span>
              <span className={styles.bdNums}>
                {int(r.rides)} rides · {money.format(r.fares)}
              </span>
            </div>
            <div className={styles.bdTrack}>
              <div className={styles.bdFill} style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
