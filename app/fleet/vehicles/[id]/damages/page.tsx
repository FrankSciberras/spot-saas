import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import VehicleDamageTracker from '@/components/admin/VehicleDamageTracker';
import styles from '@/components/admin/AdminForms.module.css';

interface PageProps {
  params: Promise<{ id: string }>;
}

type ZoneMap = Record<string, { path: string; hoverColor?: string }>;

function buildZoneMap(zones: unknown): ZoneMap {
  const map: ZoneMap = {};
  if (zones && typeof zones === 'object') {
    for (const [zoneId, zoneData] of Object.entries(zones as Record<string, { path?: string; hoverColor?: string }>)) {
      if (zoneData?.path) map[zoneId] = { path: zoneData.path, hoverColor: zoneData.hoverColor };
    }
  }
  return map;
}

/**
 * Vehicle Damages Page
 *
 * The damage diagram comes from the vehicle's chosen car-model preset
 * (vehicle_model_id → vehicle_models). The preset's uploaded images + the zones
 * traced over them (in vehicle_diagram_zones, by model_key) are managed only by
 * the platform admin in /admin/vehicle-models. Fleet operators just pick the
 * model on the vehicle; they cannot edit zones here.
 */
export default async function VehicleDamagesPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireRole(['admin', 'staff']);
  const supabase = await createClient();
  const isAdmin = user.role === 'admin';

  const { data: vehicle, error: vehicleError } = await supabase
    .from('vehicles')
    .select('id, registration_number, make, model, year, vehicle_model_id')
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .single();

  if (vehicleError || !vehicle) {
    notFound();
  }

  const { data: damages } = await supabase
    .from('vehicle_damages')
    .select(`
      *,
      reporter:reported_by (full_name, email)
    `)
    .eq('vehicle_id', id)
    .order('reported_at', { ascending: false });

  // Resolve the diagram preset. Prefer the explicitly chosen model; otherwise
  // fall back to deriving a model_key from make+model (back-compat for vehicles
  // configured before presets existed).
  let modelKey: string | null = null;
  let sideImageUrl: string | undefined;
  let topImageUrl: string | undefined;

  if (vehicle.vehicle_model_id) {
    const { data: preset } = await supabase
      .from('vehicle_models')
      .select('model_key, side_image_url, top_image_url')
      .eq('id', vehicle.vehicle_model_id)
      .single();
    if (preset) {
      modelKey = preset.model_key;
      sideImageUrl = preset.side_image_url ?? undefined;
      topImageUrl = preset.top_image_url ?? undefined;
    }
  }
  if (!modelKey) {
    modelKey = `${vehicle.make}-${vehicle.model}`.toLowerCase().replace(/\s+/g, '-');
  }

  // Load the traced zones for both views of this model.
  const { data: zoneRows } = await supabase
    .from('vehicle_diagram_zones')
    .select('view_type, zones')
    .eq('model_key', modelKey);

  let sideZoneConfigMap: ZoneMap = {};
  let topZoneConfigMap: ZoneMap = {};
  for (const row of (zoneRows ?? []) as { view_type: string; zones: unknown }[]) {
    if (row.view_type === 'side') sideZoneConfigMap = buildZoneMap(row.zones);
    else if (row.view_type === 'top') topZoneConfigMap = buildZoneMap(row.zones);
  }

  return (
    <FleetShell
      user={user}
      title={`Damages - ${vehicle.registration_number}`}
    >
      <div className={`${styles.pageHeader} header-mobile-row`}>
        <div className={styles.pageTitle}>
          <Link href={`/fleet/vehicles/${id}`} className={styles.backButton} aria-label="Back to vehicle">
            <span>←</span>
          </Link>
          <div className={styles.pageTitleMain}>
            <div className={styles.breadcrumb}>Vehicles / {vehicle.registration_number} / Damages</div>
            <h2>Vehicle Damages</h2>
            <span className={styles.subtitle}>
              {vehicle.registration_number} · {vehicle.make} {vehicle.model} {vehicle.year && `(${vehicle.year})`}
            </span>
          </div>
        </div>
        <div className={styles.pageActions}>
          <Link href={`/fleet/vehicles/${id}`} className="btn btn-secondary">
            ← Back to Vehicle
          </Link>
        </div>
      </div>

      <VehicleDamageTracker
        vehicleId={id}
        initialDamages={damages || []}
        isAdmin={isAdmin}
        sideZoneConfig={Object.keys(sideZoneConfigMap).length > 0 ? sideZoneConfigMap : undefined}
        topZoneConfig={Object.keys(topZoneConfigMap).length > 0 ? topZoneConfigMap : undefined}
        sideImageUrl={sideImageUrl}
        topImageUrl={topImageUrl}
      />
    </FleetShell>
  );
}
