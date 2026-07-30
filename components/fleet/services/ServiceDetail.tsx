'use client';

import { type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import FleetIcon from '@/components/fleet/FleetIcon';
import FleetBackLink from '@/components/fleet/FleetBackLink';
import DeleteRecordButton from '@/components/fleet/DeleteRecordButton';
import { fmtEUR } from '@/components/fleet/FleetCharts';

export type SvcDetailStatus = 'scheduled' | 'completed' | 'overdue';

export interface ServiceDetailRecord {
  id: string;
  serviceType: string;
  typeLabel: string;
  category: 'scheduled' | 'repair' | 'inspection';
  serviceDate: string;
  mileageAtService: number;
  nextServiceMileage: number | null;
  nextServiceDate: string | null;
  cost: number | null;
  currency: string;
  serviceProvider: string | null;
  description: string | null;
  partsReplaced: string | null;
  createdAt: string;
  createdBy: string | null;
  status: SvcDetailStatus;
}

export interface ServiceDetailVehicle {
  id: string;
  plate: string;
  make: string;
  model: string;
  year: number | null;
  mileage: number;
}

export interface SiblingService {
  id: string;
  typeLabel: string;
  date: string;
  cost: number | null;
  mileage: number;
}

interface Props {
  service: ServiceDetailRecord;
  vehicle: ServiceDetailVehicle | null;
  siblings: SiblingService[];
  isAdmin: boolean;
}

const STATUS_META: Record<SvcDetailStatus, { label: string; color: string; bg: string }> = {
  scheduled: { label: 'Scheduled', color: 'var(--accent)', bg: 'var(--accent-soft)' },
  completed: { label: 'Completed', color: 'var(--pos)', bg: 'var(--pos-soft)' },
  overdue: { label: 'Overdue', color: 'var(--neg)', bg: 'var(--neg-soft)' },
};

const CAT_META: Record<string, { icon: string; label: string }> = {
  scheduled: { icon: 'wrench', label: 'Scheduled maintenance' },
  repair: { icon: 'damage', label: 'Repair' },
  inspection: { icon: 'doc', label: 'Inspection' },
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const fmtShort = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

function StatusPill({ status }: { status: SvcDetailStatus }) {
  const m = STATUS_META[status];
  return (
    <span style={{ ...st.pill, color: m.color, background: m.bg }}>
      <span style={{ width: 5, height: 5, borderRadius: 99, background: m.color }} />
      {m.label}
    </span>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div style={st.card}>{children}</div>;
}

function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div style={st.cardHeader}>
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>{title}</div>
        {subtitle && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
}

function Stat({ label, value, sub, icon, accent }: { label: string; value: ReactNode; sub: string; icon: string; accent: string }) {
  return (
    <div style={st.stat}>
      <div style={{ ...st.statIco, color: accent }}><FleetIcon name={icon} size={15} /></div>
      <div style={{ marginTop: 14 }}>
        <span className="mono tnum" style={{ fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', color: accent }}>{value}</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div style={st.detailRow}>
      <span style={st.detailLabel}>{label}</span>
      <span className={mono ? 'mono tnum' : undefined} style={st.detailValue}>{value}</span>
    </div>
  );
}

/** Split a free-text parts list ("Oil filter, air filter") into chips. */
function partsList(raw: string): string[] {
  return raw
    .split(/[,\n;]/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export default function ServiceDetail({ service, vehicle, siblings, isAdmin }: Props) {
  const cat = CAT_META[service.category] || CAT_META.scheduled;

  // Distance left before the next service falls due, measured against the
  // vehicle's live odometer (or this record's reading if it's the higher one).
  const currentMileage = vehicle ? Math.max(vehicle.mileage || 0, service.mileageAtService) : service.mileageAtService;
  const kmRemaining = service.nextServiceMileage ? service.nextServiceMileage - currentMileage : null;
  const overdueByKm = kmRemaining !== null && kmRemaining <= 0;

  let nextValue = '—';
  let nextSub = 'Not scheduled';
  let nextAccent = 'var(--text-3)';
  if (kmRemaining !== null) {
    nextValue = `${Math.abs(kmRemaining).toLocaleString()} km`;
    nextSub = overdueByKm ? 'Overdue' : 'Remaining';
    nextAccent = overdueByKm ? 'var(--neg)' : kmRemaining <= 2000 ? 'var(--warn)' : 'var(--accent)';
  } else if (service.nextServiceDate) {
    nextValue = fmtShort(service.nextServiceDate);
    nextSub = 'Due by date';
    nextAccent = 'var(--accent)';
  }

  // Progress through the service interval, so the bar reads "how much of this
  // interval is used up" rather than an abstract km figure.
  const interval = service.nextServiceMileage ? service.nextServiceMileage - service.mileageAtService : 0;
  const used = interval > 0 ? Math.min(100, Math.max(0, ((currentMileage - service.mileageAtService) / interval) * 100)) : 0;

  const parts = service.partsReplaced ? partsList(service.partsReplaced) : [];

  return (
    <>
      <FleetBackLink href="/fleet/services" label="Back to services" />
      <div style={st.header} className="header-mobile-row">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>
            <Link href="/fleet/services" style={st.crumbLink}>Maintenance / Services</Link>
            {vehicle && <> / <span style={{ color: 'var(--text-2)' }}>{vehicle.plate}</span></>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={st.h1}>{service.typeLabel}</h1>
            <StatusPill status={service.status} />
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 5 }}>
            {cat.label} · {fmtDate(service.serviceDate)}
            {service.serviceProvider ? ` · ${service.serviceProvider}` : ''}
          </div>
        </div>
        <div style={st.headerActions} className="full-mobile">
          {isAdmin && (
            <>
              <Link href={`/fleet/services/${service.id}/edit`} style={st.secondaryBtn} className="fleetHover">
                <FleetIcon name="pencil" size={14} /> Edit
              </Link>
              <DeleteRecordButton
                endpoint={`/api/services/${service.id}`}
                redirectTo="/fleet/services"
                title="Delete service record?"
                body={
                  <>
                    The <strong>{service.typeLabel}</strong> record
                    {vehicle ? <> for <strong>{vehicle.plate}</strong></> : null} will be removed from the
                    maintenance history, along with the next-service reminder it feeds.
                  </>
                }
                confirmLabel="Delete record"
              />
            </>
          )}
        </div>
      </div>

      <div style={st.statsRow} className="stats-row-mobile">
        <Stat
          label="Total cost"
          value={service.cost !== null ? fmtEUR(service.cost, { decimals: 0 }) : '—'}
          sub={service.cost !== null ? 'parts & labour' : 'not recorded'}
          icon="settle"
          accent={service.cost !== null ? 'var(--pos)' : 'var(--text-3)'}
        />
        <Stat
          label="Odometer"
          value={`${service.mileageAtService.toLocaleString()} km`}
          sub="at time of service"
          icon="vehicle"
          accent="var(--text-1)"
        />
        <Stat label="Next service" value={nextValue} sub={nextSub} icon="wrench" accent={nextAccent} />
        <Stat
          label="Service date"
          value={fmtShort(service.serviceDate)}
          sub={new Date(service.serviceDate).toLocaleDateString('en-GB', { year: 'numeric' })}
          icon="calendar"
          accent="var(--text-1)"
        />
      </div>

      <div className="split-detail" style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Card>
            <CardHeader title="Work performed" subtitle={cat.label} />
            <div style={st.cardBody}>
              {service.description ? (
                <p style={st.prose}>{service.description}</p>
              ) : (
                <p style={st.empty}>No description was recorded for this job.</p>
              )}

              {parts.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={st.subLabel}>Parts replaced</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {parts.map((p, i) => (
                      <span key={i} style={st.chip}>{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Service details" subtitle="As logged on the record" />
            <div style={{ borderTop: '1px solid var(--line-1)' }}>
              <Row label="Service type" value={service.typeLabel} />
              <Row label="Category" value={cat.label} />
              <Row label="Date" value={fmtDate(service.serviceDate)} mono />
              <Row label="Odometer at service" value={`${service.mileageAtService.toLocaleString()} km`} mono />
              <Row
                label="Cost"
                value={service.cost !== null ? `${service.currency} ${service.cost.toFixed(2)}` : <span style={st.dash}>Not recorded</span>}
                mono={service.cost !== null}
              />
              <Row
                label="Garage / provider"
                value={service.serviceProvider || <span style={st.dash}>Not recorded</span>}
              />
              <Row label="Logged" value={new Date(service.createdAt).toLocaleString('en-GB')} mono />
              <Row label="Logged by" value={service.createdBy || <span style={st.dash}>—</span>} />
            </div>
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {vehicle && (
            <Card>
              <CardHeader title="Vehicle" />
              <div style={st.cardBody}>
                <Link href={`/fleet/vehicles/${vehicle.id}`} style={st.vehicleRow} className="fleetNavItem">
                  <div style={st.vehicleIco}><FleetIcon name="vehicle" size={17} /></div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="mono" style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>{vehicle.plate}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                      {vehicle.make} {vehicle.model}{vehicle.year ? ` (${vehicle.year})` : ''}
                    </div>
                  </div>
                  <FleetIcon name="chevron-right" size={15} />
                </Link>
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Current odometer</span>
                  <span className="mono tnum" style={{ fontSize: 13, color: 'var(--text-1)' }}>
                    {currentMileage.toLocaleString()} km
                  </span>
                </div>
                <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Driven since service</span>
                  <span className="mono tnum" style={{ fontSize: 13, color: 'var(--text-1)' }}>
                    {Math.max(0, currentMileage - service.mileageAtService).toLocaleString()} km
                  </span>
                </div>
              </div>
            </Card>
          )}

          {(service.nextServiceMileage || service.nextServiceDate) && (
            <Card>
              <CardHeader title="Next service due" subtitle={overdueByKm ? 'Past due — book it in' : 'Set on this record'} />
              <div style={st.cardBody}>
                {service.nextServiceMileage && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                      <span className="mono tnum" style={{ fontSize: 20, fontWeight: 500, color: 'var(--text-1)' }}>
                        {service.nextServiceMileage.toLocaleString()} km
                      </span>
                      <span
                        className="mono tnum"
                        style={{
                          fontSize: 11.5,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: overdueByKm ? 'var(--neg-soft)' : kmRemaining !== null && kmRemaining <= 2000 ? 'var(--warn-soft)' : 'var(--bg-2)',
                          color: overdueByKm ? 'var(--neg)' : kmRemaining !== null && kmRemaining <= 2000 ? 'var(--warn)' : 'var(--text-2)',
                        }}
                      >
                        {kmRemaining === null
                          ? '—'
                          : overdueByKm
                            ? `${Math.abs(kmRemaining).toLocaleString()} km over`
                            : `${kmRemaining.toLocaleString()} km left`}
                      </span>
                    </div>
                    <div style={st.track}>
                      <div style={{ ...st.trackFill, width: `${used}%`, background: overdueByKm ? 'var(--neg)' : used > 80 ? 'var(--warn)' : 'var(--accent)' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-4)' }}>{service.mileageAtService.toLocaleString()}</span>
                      <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-4)' }}>{service.nextServiceMileage.toLocaleString()}</span>
                    </div>
                  </>
                )}
                {service.nextServiceDate && (
                  <div style={{ marginTop: service.nextServiceMileage ? 14 : 0, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Due by date</span>
                    <span className="mono tnum" style={{ fontSize: 13, color: 'var(--text-1)' }}>{fmtDate(service.nextServiceDate)}</span>
                  </div>
                )}
                {vehicle && (
                  <Link
                    href={`/fleet/services/new?vehicle=${vehicle.id}`}
                    style={{ ...st.secondaryBtn, marginTop: 14, width: '100%', justifyContent: 'center' }}
                    className="fleetHover"
                  >
                    <FleetIcon name="plus" size={14} stroke={2.2} /> Log next service
                  </Link>
                )}
              </div>
            </Card>
          )}

          {vehicle && (
            <Card>
              <CardHeader
                title="Service history"
                subtitle={siblings.length > 0 ? `${siblings.length} other job${siblings.length === 1 ? '' : 's'} on ${vehicle.plate}` : vehicle.plate}
              />
              <div style={{ borderTop: '1px solid var(--line-1)', padding: '4px 16px 12px' }}>
                {siblings.map((s, i) => (
                  <Link
                    key={s.id}
                    href={`/fleet/services/${s.id}`}
                    style={{ ...st.histRow, borderBottom: i < siblings.length - 1 ? '1px solid var(--line-1)' : 'none' }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.typeLabel}</div>
                      <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                        {fmtShort(s.date)} · {s.mileage.toLocaleString()} km
                      </div>
                    </div>
                    <span className="mono tnum" style={{ fontSize: 12, color: s.cost ? 'var(--text-2)' : 'var(--text-4)', flexShrink: 0 }}>
                      {s.cost ? fmtEUR(s.cost, { decimals: 0 }) : '—'}
                    </span>
                  </Link>
                ))}
                {siblings.length === 0 && (
                  <div style={{ padding: '14px 2px', fontSize: 12.5, color: 'var(--text-3)' }}>
                    This is the only service logged for {vehicle.plate}.
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

const st: Record<string, CSSProperties> = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, padding: '0 0 16px' },
  headerActions: { display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' },
  h1: { margin: 0, fontSize: 24, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-1)' },
  crumbLink: { color: 'var(--text-3)', textDecoration: 'none' },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 10.5,
    fontFamily: 'Geist Mono, monospace',
    padding: '3px 8px 3px 7px',
    borderRadius: 5,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  },
  secondaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 13px',
    background: 'var(--bg-1)',
    border: '1px solid var(--line-2)',
    color: 'var(--text-1)',
    borderRadius: 7,
    fontSize: 13,
    fontFamily: 'inherit',
    textDecoration: 'none',
    cursor: 'pointer',
  },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 },
  stat: { padding: '14px 16px', background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 10 },
  statIco: { width: 30, height: 30, borderRadius: 7, background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  card: { background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
  cardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' },
  cardBody: { padding: '16px 18px', borderTop: '1px solid var(--line-1)' },
  prose: { margin: 0, fontSize: 13, lineHeight: 1.65, color: 'var(--text-2)', whiteSpace: 'pre-wrap' },
  empty: { margin: 0, fontSize: 13, color: 'var(--text-3)', fontStyle: 'italic' },
  subLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', marginBottom: 8 },
  chip: { fontSize: 12, padding: '4px 9px', borderRadius: 5, background: 'var(--bg-2)', border: '1px solid var(--line-1)', color: 'var(--text-2)' },
  detailRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 16,
    padding: '11px 18px',
    borderBottom: '1px solid var(--line-1)',
  },
  detailLabel: { fontSize: 12, color: 'var(--text-3)', flexShrink: 0 },
  detailValue: { fontSize: 13, color: 'var(--text-1)', textAlign: 'right', minWidth: 0 },
  dash: { color: 'var(--text-3)' },
  vehicleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    padding: '9px 10px',
    margin: '-4px -6px 0',
    borderRadius: 9,
    color: 'var(--text-3)',
    textDecoration: 'none',
  },
  vehicleIco: {
    width: 34,
    height: 34,
    borderRadius: 9,
    flexShrink: 0,
    background: 'var(--accent-soft)',
    border: '1px solid var(--accent-line)',
    color: 'var(--accent)',
    display: 'grid',
    placeItems: 'center',
  },
  track: { height: 5, borderRadius: 99, background: 'var(--bg-3)', overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: 99 },
  histRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: '9px 0',
    textDecoration: 'none',
  },
};
