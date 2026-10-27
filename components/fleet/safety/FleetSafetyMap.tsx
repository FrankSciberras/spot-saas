'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { EVENT_KIND_META, eventKindMeta, type SafetyEventKind } from '@/lib/tracking/safety';
import type { MapEvent } from './SafetyEventMap';

const SafetyEventMap = dynamic(() => import('./SafetyEventMap'), { ssr: false });

export interface FleetMapEvent {
  id: string;
  driverId: string;
  driverName: string;
  kind: SafetyEventKind;
  at: string;
  lat: number;
  lng: number;
}

/**
 * Every event of the period on one map, so repeat trouble spots (a junction
 * where several drivers brake hard) stand out. Clicking a pin opens that
 * driver's event page focused on the event.
 */
export default function FleetSafetyMap({ events }: { events: FleetMapEvent[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const mapEvents: MapEvent[] = useMemo(
    () =>
      events.map((e) => ({
        id: e.id,
        lat: e.lat,
        lng: e.lng,
        color: eventKindMeta(e.kind).color,
        tooltip: `${eventKindMeta(e.kind).label} — ${e.driverName}\n${new Date(e.at).toLocaleString([], {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })}\nClick for details`,
      })),
    [events]
  );
  const kinds = useMemo(() => [...new Set(events.map((e) => e.kind))], [events]);

  if (events.length === 0) return null;

  return (
    <div style={st.card}>
      <button className="fleetHover" style={st.head} onClick={() => setOpen((o) => !o)}>
        <span style={{ flex: 1, textAlign: 'left' }}>
          <span style={st.title}>Where events happen</span>
          <span style={st.sub}>{events.length} events this week · click a pin for the full story</span>
        </span>
        <span style={{ color: 'var(--text-4)', fontSize: 12 }}>{open ? 'Hide map ▲' : 'Show map ▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 12px 12px' }}>
          <SafetyEventMap
            events={mapEvents}
            onSelect={(id) => {
              const e = byId.get(id);
              if (e) router.push(`/fleet/safety/${e.driverId}?event=${e.id}`);
            }}
            height={320}
          />
          <div style={st.legend}>
            {(Object.keys(EVENT_KIND_META) as SafetyEventKind[])
              .filter((k) => kinds.includes(k))
              .map((k) => (
                <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: EVENT_KIND_META[k].color }} />
                  {EVENT_KIND_META[k].label}
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  card: {
    background: 'var(--bg-1)',
    border: '1px solid var(--line-1)',
    borderRadius: 'var(--radius-lg, 14px)',
    overflow: 'hidden',
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '12px 16px',
    background: 'transparent',
    border: 'none',
    fontFamily: 'inherit',
    cursor: 'pointer',
    color: 'inherit',
  },
  title: { display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' },
  sub: { display: 'block', fontSize: 12, color: 'var(--text-3)', marginTop: 2 },
  legend: { display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--text-3)', marginTop: 8 },
};
