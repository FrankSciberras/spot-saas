import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import styles from '@/components/admin/damages.module.css';

/**
 * Fleet-wide Damages Overview Page
 */
export default async function FleetDamagesPage() {
  const user = await requireRole(['admin', 'staff']);
  const supabase = await createClient();

  // Fetch all vehicles
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, registration_number, make, model, year, status')
    .order('registration_number');

  // Fetch all non-repaired damages grouped by vehicle
  const { data: damages } = await supabase
    .from('vehicle_damages')
    .select('id, vehicle_id, zone, severity, status')
    .order('reported_at', { ascending: false });

  // Build damage counts per vehicle
  const vehicleDamageMap = new Map<string, { open: number; monitoring: number; severe: number; total: number }>();
  (damages || []).forEach((d) => {
    if (!vehicleDamageMap.has(d.vehicle_id)) {
      vehicleDamageMap.set(d.vehicle_id, { open: 0, monitoring: 0, severe: 0, total: 0 });
    }
    const entry = vehicleDamageMap.get(d.vehicle_id)!;
    entry.total++;
    if (d.status === 'open') entry.open++;
    if (d.status === 'monitoring') entry.monitoring++;
    if (d.severity === 'severe' && d.status !== 'repaired') entry.severe++;
  });

  // Total stats
  const totalDamages = damages?.length || 0;
  const totalOpen = damages?.filter((d) => d.status === 'open').length || 0;
  const totalSevere = damages?.filter((d) => d.severity === 'severe' && d.status !== 'repaired').length || 0;
  const vehiclesWithDamage = vehicleDamageMap.size;

  // Sort vehicles: those with damages first (by open count desc), then rest
  const sortedVehicles = [...(vehicles || [])].sort((a, b) => {
    const aInfo = vehicleDamageMap.get(a.id);
    const bInfo = vehicleDamageMap.get(b.id);
    if (aInfo && !bInfo) return -1;
    if (!aInfo && bInfo) return 1;
    if (aInfo && bInfo) return bInfo.open - aInfo.open;
    return 0;
  });

  return (
    <DashboardLayout user={user} variant="admin" title="Fleet Damages">
      <div className={styles.fleetContainer}>
        <div className={styles.fleetHeader}>
          <h2>Fleet Damages Overview</h2>
        </div>

        {/* Stats */}
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{totalDamages}</div>
            <div className={styles.statLabel}>Total Records</div>
          </div>
          <div className={styles.statCard}>
            <div className={`${styles.statValue} ${styles.statValueDanger}`}>{totalOpen}</div>
            <div className={styles.statLabel}>Open Damages</div>
          </div>
          <div className={styles.statCard}>
            <div className={`${styles.statValue} ${styles.statValueWarning}`}>{totalSevere}</div>
            <div className={styles.statLabel}>Severe (Active)</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{vehiclesWithDamage}</div>
            <div className={styles.statLabel}>Vehicles Affected</div>
          </div>
        </div>

        {/* Vehicle List */}
        {sortedVehicles.map((vehicle) => {
          const info = vehicleDamageMap.get(vehicle.id);
          return (
            <Link
              key={vehicle.id}
              href={`/admin/vehicles/${vehicle.id}/damages`}
              className={styles.vehicleDamageRow}
            >
              <div className={styles.vehicleInfo}>
                <div className={styles.vehicleReg}>{vehicle.registration_number}</div>
                <div className={styles.vehicleMake}>
                  {vehicle.make} {vehicle.model} {vehicle.year && `(${vehicle.year})`}
                </div>
              </div>

              <div className={styles.vehicleDamageCount}>
                {info ? (
                  <>
                    {info.severe > 0 && (
                      <span className={styles.countBadge} style={{ background: 'rgba(239,68,68,0.1)', color: '#dc2626' }}>
                        {info.severe} severe
                      </span>
                    )}
                    {info.open > 0 && (
                      <span className={styles.countBadge} style={{ background: 'rgba(245,158,11,0.1)', color: '#b45309' }}>
                        {info.open} open
                      </span>
                    )}
                    {info.monitoring > 0 && (
                      <span className={styles.countBadge} style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
                        {info.monitoring} monitoring
                      </span>
                    )}
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {info.total} total
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No damages</span>
                )}
              </div>

              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                <path d="M9 18l6-6-6-6" />
              </svg>
            </Link>
          );
        })}

        {(!vehicles || vehicles.length === 0) && (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>No vehicles found</div>
            <div className={styles.emptyText}>Add vehicles to your fleet to start tracking damages.</div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
