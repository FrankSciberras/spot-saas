// =============================================================================
// PUBLIC API — VEHICLE WRITE MAPPING
// =============================================================================
// Shared by POST /v1/vehicles and PATCH /v1/vehicles/{id}. Same principle as
// the driver mapper: an explicit allow-list, so organization_id and every other
// internal column are unreachable from a request body.
// =============================================================================

import { FieldErrors, optDate, optEnum, optNumber, optString, optUuid } from '@/lib/api/validate';

export const VEHICLE_WRITABLE_FIELDS = [
  'registration_number',
  'make',
  'model',
  'year',
  'mileage',
  'status',
  'assigned_driver_id',
  'insurance_expiry_date',
  'road_license_expiry_date',
  'color',
  'notes',
] as const;

const VEHICLE_STATUSES = ['active', 'in_service', 'out_of_service'] as const;

export function buildVehiclePayload(
  errs: FieldErrors,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const set = (field: string, value: unknown) => {
    if (value !== undefined) out[field] = value;
  };

  set('registration_number', optString(errs, body, 'registration_number', { max: 32, nullable: false }));
  set('make', optString(errs, body, 'make', { max: 60, nullable: false }));
  set('model', optString(errs, body, 'model', { max: 60, nullable: false }));
  // 1900 floor stops a typo'd 19 or 202 landing in the fleet's records.
  set('year', optNumber(errs, body, 'year', { min: 1900, max: new Date().getFullYear() + 2, integer: true }));
  set('mileage', optNumber(errs, body, 'mileage', { min: 0, max: 100_000_000, integer: true }));
  set('status', optEnum(errs, body, 'status', VEHICLE_STATUSES));
  set('assigned_driver_id', optUuid(errs, body, 'assigned_driver_id'));
  set('insurance_expiry_date', optDate(errs, body, 'insurance_expiry_date'));
  set('road_license_expiry_date', optDate(errs, body, 'road_license_expiry_date'));
  set('color', optString(errs, body, 'color', { max: 40 }));
  set('notes', optString(errs, body, 'notes', { max: 2000 }));

  return out;
}
