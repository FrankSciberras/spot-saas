'use client';

// =============================================================================
// Vehicle profile — tab bar and the data tabs (Shifts, Parts, Damages, Costs,
// Timeline). The Overview / Documents / Service tabs reuse the editable
// sections in components/admin/VehicleProfile.tsx.
// =============================================================================

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useMoney } from '@/components/fleet/FleetSettingsProvider';
import styles from './vehicleTabs.module.css';

// ─── Data shapes (loaded by app/fleet/vehicles/[id]/page.tsx) ────────────────

export interface TabShift {
  id: string;
  start_time: string;
  end_time: string | null;
  starting_mileage: number | null;
  ending_mileage: number | null;
  dashcam_checked: boolean | null;
  car_internal_checked: boolean | null;
  driver: { id: string; full_name: string } | null;
}

export interface TabDamage {
  id: string;
  zone: string;
  description: string;
  severity: 'minor' | 'moderate' | 'severe' | string;
  status: 'open' | 'repaired' | 'monitoring' | string;
  repair_cost: number | null;
  reported_at: string;
  repaired_at: string | null;
}

export interface TabPartUse {
  id: string;
  used_at: string;
  quantity: number;
  unit_cost: number | null;
  part_name: string;
}

export interface TabCost {
  id: string;
  txn_date: string;
  amount: number;
  description: string | null;
  category: string;
  kind: 'income' | 'expense';
}

export interface TabService {
  id: string;
  service_date: string;
  service_type: string;
  cost: number | null;
}

export interface TabDoc {
  id: string;
  type: string;
  file_name: string | null;
  uploaded_at: string;
}

export type VehicleTabKey = 'overview' | 'shifts' | 'service' | 'damages' | 'costs' | 'documents' | 'timeline';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const zoneLabel = (z: string) => z.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function Empty({ children }: { children: ReactNode }) {
  return <div className={styles.empty}>{children}</div>;
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.panel}>
      <header className={styles.panelHead}>
        <h3>{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────

export function VehicleTabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: VehicleTabKey; label: string; count?: number; alert?: boolean }[];
  active: VehicleTabKey;
  onChange: (key: VehicleTabKey) => void;
}) {
  return (
    <div className={styles.tabBar} role="tablist" aria-label="Vehicle sections">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          id={`vtab-${t.key}`}
          aria-selected={active === t.key}
          aria-controls={`vpanel-${t.key}`}
          className={`${styles.tab} ${active === t.key ? styles.tabOn : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
          {t.count != null && t.count > 0 && (
            <span className={`${styles.count} ${t.alert ? styles.countAlert : ''}`}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Shifts ──────────────────────────────────────────────────────────────────

export function ShiftsPanel({ shifts }: { shifts: TabShift[] }) {
  // "Now" for shifts still running, read once when the tab opens.
  const [now] = useState(() => Date.now());
  const totals = useMemo(() => {
    let hours = 0;
    let km = 0;
    let missed = 0;
    for (const s of shifts) {
      const end = s.end_time ? Date.parse(s.end_time) : now;
      hours += Math.max(0, end - Date.parse(s.start_time)) / 3_600_000;
      if (s.ending_mileage != null && s.starting_mileage != null && s.ending_mileage >= s.starting_mileage) {
        km += s.ending_mileage - s.starting_mileage;
      }
      if (s.dashcam_checked !== true || s.car_internal_checked !== true) missed += 1;
    }
    return { hours, km, missed };
  }, [shifts, now]);

  if (!shifts.length) return <Empty>No shifts recorded with this vehicle yet.</Empty>;

  return (
    <Panel title={`Shifts · last ${shifts.length}`} action={<Link href="/fleet/shifts" className={styles.link}>All shifts →</Link>}>
      <div className={styles.kpis}>
        <div><span>{Math.round(totals.hours).toLocaleString('en-GB')} h</span>on the road</div>
        <div><span>{totals.km.toLocaleString('en-GB')} km</span>driven (from odometer readings)</div>
        <div className={totals.missed ? styles.warnText : undefined}><span>{totals.missed}</span>shifts with a missed pre-shift check</div>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Date</th><th>Driver</th><th>Start</th><th>End</th><th className={styles.r}>Hours</th><th className={styles.r}>Km</th><th>Checks</th></tr>
          </thead>
          <tbody>
            {shifts.map((s) => {
              const end = s.end_time ? Date.parse(s.end_time) : now;
              const h = Math.max(0, end - Date.parse(s.start_time)) / 3_600_000;
              const km = s.ending_mileage != null && s.starting_mileage != null ? s.ending_mileage - s.starting_mileage : null;
              const ok = s.dashcam_checked === true && s.car_internal_checked === true;
              return (
                <tr key={s.id}>
                  <td>
                    <Link href={`/fleet/shifts/${s.id}`} className={styles.rowLink}>{day(s.start_time)}</Link>
                  </td>
                  <td>{s.driver ? <Link href={`/fleet/drivers/${s.driver.id}`} className={styles.rowLink}>{s.driver.full_name}</Link> : <span className={styles.muted}>—</span>}</td>
                  <td className={styles.num}>{time(s.start_time)}</td>
                  <td className={styles.num}>{s.end_time ? time(s.end_time) : <span className={styles.live}>On shift</span>}</td>
                  <td className={`${styles.num} ${styles.r}`}>{h.toFixed(1)}</td>
                  <td className={`${styles.num} ${styles.r}`}>{km != null && km >= 0 ? km.toLocaleString('en-GB') : '—'}</td>
                  <td>
                    {ok ? (
                      <span className={styles.okText}>Done</span>
                    ) : (
                      <span className={styles.warnText}>
                        Missed {[s.dashcam_checked !== true && 'dashcam', s.car_internal_checked !== true && 'interior'].filter(Boolean).join(' + ')}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ─── Parts used (inside the Service & parts tab) ─────────────────────────────

export function PartsPanel({ parts, showCosts }: { parts: TabPartUse[]; showCosts: boolean }) {
  const fmt = useMoney();
  const total = parts.reduce((s, p) => s + (p.unit_cost ?? 0) * p.quantity, 0);
  return (
    <Panel title="Parts used" action={<Link href="/fleet/parts" className={styles.link}>Parts stock →</Link>}>
      {parts.length === 0 ? (
        <Empty>No parts logged against this vehicle.</Empty>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Date</th><th>Part</th><th className={styles.r}>Qty</th>{showCosts && <th className={styles.r}>Cost</th>}</tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.id}>
                  <td>{day(p.used_at)}</td>
                  <td>{p.part_name}</td>
                  <td className={`${styles.num} ${styles.r}`}>{p.quantity}</td>
                  {showCosts && <td className={`${styles.num} ${styles.r}`}>{p.unit_cost != null ? fmt(p.unit_cost * p.quantity) : '—'}</td>}
                </tr>
              ))}
            </tbody>
            {showCosts && (
              <tfoot>
                <tr><td colSpan={3}>Total</td><td className={`${styles.num} ${styles.r}`}>{fmt(total)}</td></tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </Panel>
  );
}

// ─── Damages ─────────────────────────────────────────────────────────────────

const SEVERITY_CLS: Record<string, string> = { severe: styles.pillBad, moderate: styles.pillWarn, minor: styles.pillMuted };
const STATUS_CLS: Record<string, string> = { open: styles.pillWarn, monitoring: styles.pillMuted, repaired: styles.pillOk };

export function DamagesPanel({ damages, vehicleId, showCosts }: { damages: TabDamage[]; vehicleId: string; showCosts: boolean }) {
  const fmt = useMoney();
  const open = damages.filter((d) => d.status !== 'repaired');
  const diagram = (
    <Link href={`/fleet/vehicles/${vehicleId}/damages`} className={styles.link}>
      Car diagram &amp; photos →
    </Link>
  );
  if (!damages.length) {
    return (
      <Panel title="Damages" action={diagram}>
        <Empty>No damages reported for this vehicle.</Empty>
      </Panel>
    );
  }
  return (
    <Panel title={`Damages · ${open.length} open of ${damages.length}`} action={diagram}>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>Reported</th><th>Where</th><th>What</th><th>Severity</th><th>Status</th>{showCosts && <th className={styles.r}>Repair cost</th>}</tr>
          </thead>
          <tbody>
            {damages.map((d) => (
              <tr key={d.id}>
                <td>{day(d.reported_at)}</td>
                <td>{zoneLabel(d.zone)}</td>
                <td className={styles.wrapCell}>{d.description}</td>
                <td><span className={`${styles.pill} ${SEVERITY_CLS[d.severity] ?? styles.pillMuted}`}>{d.severity}</span></td>
                <td>
                  <span className={`${styles.pill} ${STATUS_CLS[d.status] ?? styles.pillMuted}`}>{d.status}</span>
                  {d.repaired_at && <span className={styles.sub}>{day(d.repaired_at)}</span>}
                </td>
                {showCosts && <td className={`${styles.num} ${styles.r}`}>{d.repair_cost != null ? fmt(d.repair_cost) : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ─── Costs (admins, Bookkeeping on) ──────────────────────────────────────────

export function CostsPanel({
  costs,
  services,
  damages,
  parts,
}: {
  costs: TabCost[];
  services: TabService[];
  damages: TabDamage[];
  parts: TabPartUse[];
}) {
  const fmt = useMoney();
  // The last 12 months, by the date the money moved. Services, repairs and
  // parts don't post into bookkeeping, so the four sources add up without
  // double counting (unless someone typed the same bill into both).
  const since = new Date();
  since.setFullYear(since.getFullYear() - 1);
  const sinceIso = since.toISOString().slice(0, 10);

  const inYear = (d: string | null | undefined) => !!d && d.slice(0, 10) >= sinceIso;
  const expenses = costs.filter((c) => c.kind === 'expense' && inYear(c.txn_date)).reduce((s, c) => s + c.amount, 0);
  const income = costs.filter((c) => c.kind === 'income' && inYear(c.txn_date)).reduce((s, c) => s + c.amount, 0);
  const serviceCost = services.filter((s) => inYear(s.service_date)).reduce((s, x) => s + (x.cost ?? 0), 0);
  const repairCost = damages
    .filter((d) => d.status === 'repaired' && inYear(d.repaired_at ?? d.reported_at))
    .reduce((s, d) => s + (d.repair_cost ?? 0), 0);
  const partsCost = parts.filter((p) => inYear(p.used_at)).reduce((s, p) => s + (p.unit_cost ?? 0) * p.quantity, 0);
  const totalCost = expenses + serviceCost + repairCost + partsCost;

  return (
    <>
      <div className={styles.costTiles}>
        <div className={styles.costTile}><span>Total cost</span><strong>{fmt(totalCost)}</strong><em>last 12 months</em></div>
        <div className={styles.costTile}><span>Bookkeeping</span><strong>{fmt(expenses)}</strong><em>expenses linked to this car</em></div>
        <div className={styles.costTile}><span>Services</span><strong>{fmt(serviceCost)}</strong><em>from service records</em></div>
        <div className={styles.costTile}><span>Repairs + parts</span><strong>{fmt(repairCost + partsCost)}</strong><em>repaired damages and parts used</em></div>
        {income > 0 && (
          <div className={styles.costTile}><span>Income</span><strong className={styles.okText}>{fmt(income)}</strong><em>net {fmt(income - totalCost)}</em></div>
        )}
      </div>
      <Panel title="Bookkeeping lines for this car" action={<Link href="/fleet/earnings" className={styles.link}>Bookkeeping →</Link>}>
        {costs.length === 0 ? (
          <Empty>No bookkeeping lines are linked to this vehicle. When you add an expense or income in Bookkeeping, pick this car to see it here.</Empty>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Date</th><th>Category</th><th>Description</th><th className={styles.r}>Amount</th></tr>
              </thead>
              <tbody>
                {costs.map((c) => (
                  <tr key={c.id}>
                    <td>{day(c.txn_date)}</td>
                    <td>{c.category}</td>
                    <td className={styles.wrapCell}>{c.description || <span className={styles.muted}>—</span>}</td>
                    <td className={`${styles.num} ${styles.r} ${c.kind === 'income' ? styles.okText : ''}`}>
                      {c.kind === 'income' ? '+' : '−'}
                      {fmt(c.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

// ─── Timeline ────────────────────────────────────────────────────────────────

interface TimelineItem {
  at: string;
  kind: 'shift' | 'service' | 'damage' | 'repair' | 'document';
  title: string;
  detail?: string;
  href?: string;
}

const KIND_LABEL: Record<TimelineItem['kind'], string> = {
  shift: 'Shift',
  service: 'Service',
  damage: 'Damage',
  repair: 'Repaired',
  document: 'Document',
};

export function TimelinePanel({
  shifts,
  services,
  damages,
  documents,
  serviceLabel,
}: {
  shifts: TabShift[];
  services: TabService[];
  damages: TabDamage[];
  documents: TabDoc[];
  serviceLabel: (type: string) => string;
}) {
  const items = useMemo(() => {
    const out: TimelineItem[] = [];
    for (const s of shifts) {
      out.push({
        at: s.start_time,
        kind: 'shift',
        title: `${s.driver?.full_name ?? 'A driver'} started a shift`,
        detail: s.end_time ? `${time(s.start_time)}–${time(s.end_time)}` : 'still on shift',
        href: `/fleet/shifts/${s.id}`,
      });
    }
    for (const s of services) {
      out.push({ at: `${s.service_date}T12:00:00`, kind: 'service', title: serviceLabel(s.service_type), href: `/fleet/services/${s.id}` });
    }
    for (const d of damages) {
      out.push({ at: d.reported_at, kind: 'damage', title: `${zoneLabel(d.zone)}: ${d.description}`, detail: d.severity });
      if (d.repaired_at) out.push({ at: d.repaired_at, kind: 'repair', title: `${zoneLabel(d.zone)} repaired` });
    }
    for (const f of documents) {
      out.push({ at: f.uploaded_at, kind: 'document', title: f.file_name || f.type.replace(/_/g, ' ').toLowerCase(), detail: 'uploaded' });
    }
    return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 60);
  }, [shifts, services, damages, documents, serviceLabel]);

  if (!items.length) return <Empty>Nothing has happened with this vehicle yet.</Empty>;

  return (
    <Panel title="Timeline">
      <ol className={styles.timeline}>
        {items.map((it, i) => (
          <li key={i} className={styles[`tl_${it.kind}`]}>
            <span className={styles.tlDot} aria-hidden="true" />
            <div className={styles.tlBody}>
              <span className={styles.tlKind}>{KIND_LABEL[it.kind]}</span>
              {it.href ? (
                <Link href={it.href} className={styles.rowLink}>{it.title}</Link>
              ) : (
                <span>{it.title}</span>
              )}
              {it.detail && <span className={styles.muted}> · {it.detail}</span>}
            </div>
            <time className={styles.tlTime}>{day(it.at)}</time>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

// ─── Overview: what's coming up ──────────────────────────────────────────────

export interface ComingUpItem {
  label: string;
  value: string;
  tone: 'ok' | 'warn' | 'bad' | 'muted';
  /** Clicking the tile opens this tab. */
  tab?: VehicleTabKey;
}

export function ComingUp({ items, onOpenTab }: { items: ComingUpItem[]; onOpenTab: (tab: VehicleTabKey) => void }) {
  return (
    <div className={styles.comingUp}>
      {items.map((it) => {
        const body = (
          <>
            <span className={styles.cuLabel}>{it.label}</span>
            <span className={`${styles.cuValue} ${it.tone === 'bad' ? styles.badText : it.tone === 'warn' ? styles.warnText : it.tone === 'muted' ? styles.muted : ''}`}>{it.value}</span>
          </>
        );
        return it.tab ? (
          <button key={it.label} type="button" className={styles.cuItem} onClick={() => onOpenTab(it.tab!)}>{body}</button>
        ) : (
          <div key={it.label} className={styles.cuItem}>{body}</div>
        );
      })}
    </div>
  );
}
