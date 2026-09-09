// =============================================================================
// SERVICE-DUE: which service record defines a vehicle's NEXT service?
// =============================================================================
// Three places used to answer this differently — the notification rules engine
// took the latest record by service_date, while the shift-start service check
// and the Services page took the highest mileage_at_service — so the same
// vehicle could be "due" in one alert and not in another. This is the single
// rule they all share now:
//
//   The record with the highest mileage_at_service wins (the odometer only
//   goes forward, so that is the most recent visit to the workshop). Ties, or
//   records without a mileage, fall back to the latest service_date. Records
//   that set no next-service target (neither km nor date) are ignored.
// =============================================================================

export interface ServiceTargetRow {
  id: string;
  service_date: string | null;
  mileage_at_service: number | null;
  next_service_mileage: number | null;
  next_service_date: string | null;
}

function setsTarget(s: ServiceTargetRow): boolean {
  return s.next_service_mileage != null || !!s.next_service_date;
}

function isNewer(candidate: ServiceTargetRow, current: ServiceTargetRow): boolean {
  const km = (candidate.mileage_at_service ?? -1) - (current.mileage_at_service ?? -1);
  if (km !== 0) return km > 0;
  return (candidate.service_date ?? '') > (current.service_date ?? '');
}

/** The service record that defines the next service target, or null if none does. */
export function pickLatestService<T extends ServiceTargetRow>(services: T[]): T | null {
  let best: T | null = null;
  for (const s of services) {
    if (!setsTarget(s)) continue;
    if (!best || isNewer(s, best)) best = s;
  }
  return best;
}

/** Same rule, applied per vehicle. */
export function latestServiceByVehicle<T extends ServiceTargetRow & { vehicle_id: string }>(
  services: T[]
): Map<string, T> {
  const byVehicle = new Map<string, T>();
  for (const s of services) {
    if (!setsTarget(s)) continue;
    const current = byVehicle.get(s.vehicle_id);
    if (!current || isNewer(s, current)) byVehicle.set(s.vehicle_id, s);
  }
  return byVehicle;
}
