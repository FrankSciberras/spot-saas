import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import { GPS_PROVIDERS, gpsProviderInfo } from '@/lib/gps/catalog';
import { getGpsProvider } from '@/lib/gps/providers';
import { loadGpsConnections } from '@/lib/gps/sync';
import { validLatLng } from '@/lib/gps/types';
import GpsConnect, { type ConnectableProvider } from './GpsConnect';
import GpsAccounts, { type GpsAccountView } from './GpsAccounts';
import GpsDevicesTable, { type GpsDeviceRow, type VehicleChoice } from './GpsDevicesTable';
import RovoraGpsPanel from './RovoraGpsPanel';
import GpsPrivacyToggle from './GpsPrivacyToggle';
import { hostedGpsPublicInfo } from '@/lib/gps/hosted/config';
import styles from './gps.module.css';

export const dynamic = 'force-dynamic';

/**
 * Operations → GPS trackers.
 *
 * Not connected → pick your GPS platform and paste its key.
 * Connected     → the connected accounts, then every tracker with a "which
 *                 vehicle is it in?" picker (auto-matched by number plate).
 *
 * Positions refresh about once a minute (lib/gps/sync.ts) and show on the Live
 * Map, where the fleet ticks Drivers, Vehicles or both.
 *
 * Admin only: the page holds the fleet's GPS login.
 */
export default async function GpsPage({ searchParams }: { searchParams: Promise<{ provider?: string }> }) {
  const user = await requireRole(['admin']);
  const { provider: wanted } = await searchParams;
  const orgId = user.organization_id;
  const admin = createAdminClient();

  const providers: ConnectableProvider[] = GPS_PROVIDERS.flatMap((p) => {
    const adapter = getGpsProvider(p.key);
    return adapter ? [{ ...p, fields: adapter.fields, steps: adapter.steps }] : [];
  });

  const connections = await loadGpsConnections(admin, orgId);
  // Rovora's own GPS server — only offered once it's set up (env vars).
  const hosted = hostedGpsPublicInfo();

  const [devicesRes, vehiclesRes, privacyRes] = await Promise.all([
    connections.length
      ? admin
          .from('gps_devices')
          .select('id, connection_id, provider, name, unique_id, plate, vehicle_id, link_source, latitude, longitude, speed_kmh, ignition, recorded_at')
          .eq('organization_id', orgId)
          .order('name', { ascending: true })
      : Promise.resolve({ data: [] }),
    admin
      .from('vehicles')
      .select('id, registration_number, make, model, status')
      .eq('organization_id', orgId)
      .order('registration_number', { ascending: true }),
    admin.from('organizations').select('gps_hide_off_shift').eq('id', orgId).maybeSingle(),
  ]);
  const hideOffShift = privacyRes.error ? true : privacyRes.data?.gps_hide_off_shift !== false;

  type DeviceRecord = {
    id: string;
    connection_id: string;
    provider: string;
    name: string | null;
    unique_id: string | null;
    plate: string | null;
    vehicle_id: string | null;
    link_source: 'auto' | 'manual' | null;
    latitude: number | null;
    longitude: number | null;
    speed_kmh: number | null;
    ignition: boolean | null;
    recorded_at: string | null;
  };
  const deviceRecords = (devicesRes.data ?? []) as DeviceRecord[];

  const devices: GpsDeviceRow[] = deviceRecords.map((d) => ({
    id: d.id,
    name: d.name,
    uniqueId: d.unique_id,
    plate: d.plate,
    providerName: gpsProviderInfo(d.provider)?.name ?? d.provider,
    vehicleId: d.vehicle_id,
    linkSource: d.link_source,
    recordedAt: d.recorded_at,
    speedKmh: d.speed_kmh,
    ignition: d.ignition,
    hasFix: validLatLng(d.latitude, d.longitude),
    hosted: d.provider === 'rovora',
  }));
  const hostedCount = devices.filter((d) => d.hosted).length;

  type VehicleRecord = { id: string; registration_number: string | null; make: string | null; model: string | null };
  const vehicles: VehicleChoice[] = ((vehiclesRes.data ?? []) as VehicleRecord[]).map((v) => ({
    id: v.id,
    label: [v.registration_number, [v.make, v.model].filter(Boolean).join(' ')].filter(Boolean).join(' — ') || 'Vehicle',
  }));

  const accounts: GpsAccountView[] = connections.map((c) => {
    const info = gpsProviderInfo(c.provider);
    const mine = deviceRecords.filter((d) => d.connection_id === c.id);
    return {
      id: c.id,
      provider: c.provider,
      providerName: info?.name ?? c.provider,
      mark: info?.mark ?? '?',
      logoSrc: info?.logoSrc,
      bg: info?.bg ?? '#64748b',
      fg: info?.fg ?? '#ffffff',
      accountLabel: c.account_label,
      status: c.status,
      lastError: c.last_error,
      lastSyncedAt: c.last_synced_at,
      deviceCount: mine.length,
      linkedCount: mine.filter((d) => d.vehicle_id).length,
    };
  });

  const unlinked = devices.filter((d) => !d.vehicleId).length;

  return (
    <FleetShell user={user} title="GPS trackers">
      <div className={styles.container}>
        <div className={`${styles.header} header-mobile-row`}>
          <div>
            <div className={styles.breadcrumb}>Operations / GPS trackers</div>
            <h1 className={styles.title}>GPS trackers</h1>
            <p className={styles.subtitle}>
              {connections.length
                ? 'Every tracker on your connected GPS accounts, and the vehicle it’s fitted in. Positions refresh about once a minute.'
                : 'Already have GPS trackers in your cars? Connect the platform they report to, and every vehicle shows on the Live Map — even when the driver’s phone is off.'}
            </p>
          </div>
          {connections.length > 0 && (
            <div className={styles.headerLinks}>
              <Link className={styles.ghostBtn} href="/fleet/tracking">
                Open Live Map
              </Link>
            </div>
          )}
        </div>

        {hosted && (
          <RovoraGpsPanel
            host={hosted.deviceHost}
            port={hosted.devicePort}
            priceEur={hosted.priceEur}
            vehicles={vehicles}
            trackerCount={hostedCount}
          />
        )}

        {connections.length === 0 ? (
          <>
            <h2 className={styles.sectionTitle}>
              {hosted ? 'Already have trackers with a GPS company?' : '1. Which GPS platform do your trackers use?'}
            </h2>
            <p className={styles.sectionLead}>
              Not sure? It&rsquo;s the website or app your GPS installer gave you to see your cars. Teltonika,
              Ruptela and most other trackers report to one of these.
            </p>
            <GpsConnect providers={providers} initialProvider={wanted ?? null} />

            {!hosted && <section className={styles.panel}>
              <h2 className={styles.panelTitle}>No GPS trackers yet?</h2>
              <p className={styles.sectionLead} style={{ marginTop: 6 }}>
                You don&rsquo;t need them — the Rovora Driver app already puts every driver on the Live Map. Trackers
                add the car itself: it shows up even when the phone is flat, and you get ignition and odometer.
              </p>
              <div className={styles.adviceGrid}>
                <div className={styles.advice}>
                  <strong>1 · Pick a tracker</strong>
                  A wired Teltonika FMC920 / FMC130 (around €40–70) is the usual choice for taxis. Your GPS installer can
                  fit it behind the dashboard in about 20 minutes.
                </div>
                <div className={styles.advice}>
                  <strong>2 · Pick a platform</strong>
                  flespi or a hosted Traccar plan both cost a few euro per tracker a month and take Teltonika
                  out of the box. Ask the installer to point the tracker at it.
                </div>
                <div className={styles.advice}>
                  <strong>3 · Connect it here</strong>
                  Paste the platform&rsquo;s key above. Rovora matches each tracker to your car by number plate —
                  name the tracker after the plate and it&rsquo;s automatic.
                </div>
              </div>
            </section>}
          </>
        ) : (
          <>
            <GpsAccounts accounts={accounts} providers={providers} />

            <section className={styles.panel}>
              <div className={styles.panelHead}>
                <h2 className={styles.panelTitle}>Trackers</h2>
                <span className={styles.panelMeta}>
                  {devices.length} tracker{devices.length === 1 ? '' : 's'}
                  {unlinked > 0 ? ` · ${unlinked} not in a vehicle yet` : ' · all in a vehicle'}
                </span>
              </div>
              {devices.length === 0 ? (
                <p className={styles.sectionLead}>
                  This account doesn&rsquo;t have any trackers yet. Add them on the GPS platform and they appear here
                  within a minute.
                </p>
              ) : (
                <GpsDevicesTable
                  devices={devices}
                  vehicles={vehicles}
                  hostedServer={hosted ? { host: hosted.deviceHost, port: hosted.devicePort } : null}
                />
              )}
              <p className={styles.footNote}>
                Trackers are matched to vehicles by number plate (from the tracker&rsquo;s plate field, or a plate
                written in its name). Pick a vehicle yourself and Rovora never changes it. A tracker in a vehicle shows
                on the Live Map with that car&rsquo;s plate — and with the driver whose shift is in that car.
              </p>
            </section>

            <GpsPrivacyToggle initialHide={hideOffShift} />
          </>
        )}
      </div>
    </FleetShell>
  );
}
