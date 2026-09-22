// =============================================================================
// PUBLIC API — DRIVER WRITE MAPPING
// =============================================================================
// Shared by POST /v1/drivers and PATCH /v1/drivers/{id} so create and update
// accept exactly the same field set and validate it exactly the same way.
//
// This allow-list IS the security boundary for driver writes: organization_id,
// settlement overrides and every other internal column are simply not
// reachable from a request body.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  FieldErrors,
  optDate,
  optEnum,
  optString,
  optUuid,
} from '@/lib/api/validate';

export const DRIVER_WRITABLE_FIELDS = [
  'full_name',
  'phone',
  'address',
  'status',
  'employment_type',
  'user_id',
  'assigned_vehicle_id',
  'id_card_number',
  'id_card_expiry_date',
  'police_conduct_expiry_date',
  'driving_license_number',
  'driving_license_expiry_date',
  'tag_license_expiry_date',
  'notes',
] as const;

const DRIVER_STATUSES = ['active', 'inactive'] as const;
const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'terminated'] as const;

/**
 * Turns a validated request body into a database payload. Keys absent from the
 * body are absent from the result, which is what makes PATCH a true partial
 * update rather than a silent overwrite with nulls.
 */
export function buildDriverPayload(
  errs: FieldErrors,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const set = (field: string, value: unknown) => {
    if (value !== undefined) out[field] = value;
  };

  set('full_name', optString(errs, body, 'full_name', { max: 200, nullable: false }));
  set('phone', optString(errs, body, 'phone', { max: 40 }));
  set('address', optString(errs, body, 'address', { max: 500 }));
  set('status', optEnum(errs, body, 'status', DRIVER_STATUSES));
  set('employment_type', optEnum(errs, body, 'employment_type', EMPLOYMENT_TYPES, { nullable: true }));
  set('user_id', optUuid(errs, body, 'user_id'));
  set('assigned_vehicle_id', optUuid(errs, body, 'assigned_vehicle_id'));
  set('id_card_number', optString(errs, body, 'id_card_number', { max: 60 }));
  set('id_card_expiry_date', optDate(errs, body, 'id_card_expiry_date'));
  set('police_conduct_expiry_date', optDate(errs, body, 'police_conduct_expiry_date'));
  set('driving_license_number', optString(errs, body, 'driving_license_number', { max: 60 }));
  set('driving_license_expiry_date', optDate(errs, body, 'driving_license_expiry_date'));
  set('tag_license_expiry_date', optDate(errs, body, 'tag_license_expiry_date'));
  set('notes', optString(errs, body, 'notes', { max: 2000 }));

  return out;
}

/** Cross-tenant guard: is this vehicle id actually in the caller's fleet? */
export async function ensureVehicleInFleet(
  admin: SupabaseClient,
  organizationId: string,
  vehicleId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('vehicles')
    .select('id')
    .eq('id', vehicleId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  return Boolean(data);
}

/** Cross-tenant guard: is this driver id actually in the caller's fleet? */
export async function ensureDriverInFleet(
  admin: SupabaseClient,
  organizationId: string,
  driverId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('drivers')
    .select('id')
    .eq('id', driverId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  return Boolean(data);
}
