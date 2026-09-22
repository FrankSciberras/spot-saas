import type { NextRequest } from 'next/server';
import { withApiAuth, readJsonBody, type ApiContext } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/api/respond';
import { createAdminClient } from '@/lib/supabase/server';
import { checkApiCapacity } from '@/lib/api/capacity';
import { VEHICLE_COLUMNS, serializeVehicle } from '@/lib/api/serializers';
import { VEHICLE_WRITABLE_FIELDS, buildVehiclePayload } from '@/lib/api/resources/vehicles';
import { ensureDriverInFleet } from '@/lib/api/resources/drivers';
import {
  FieldErrors,
  sanitizeSearchTerm,
  pageMeta,
  readPagination,
  rejectUnknownFields,
  requiredString,
} from '@/lib/api/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SORTABLE = ['registration_number', 'make', 'mileage', 'created_at', 'updated_at', 'status'] as const;

/**
 * GET /api/v1/vehicles — list the fleet's vehicles.
 *
 * Filters: `status`, `assigned_driver_id`, `search` (registration, make or
 * model), `updated_since`. Paginated with `limit` / `offset`.
 */
export const GET = withApiAuth('vehicles:read', async (req: NextRequest, ctx: ApiContext) => {
  const url = new URL(req.url);
  const page = readPagination(url);
  const admin = createAdminClient();

  let query = admin
    .from('vehicles')
    .select(VEHICLE_COLUMNS, { count: 'exact' })
    .eq('organization_id', ctx.organizationId);

  const status = url.searchParams.get('status');
  if (status) query = query.eq('status', status);

  const driverId = url.searchParams.get('assigned_driver_id');
  if (driverId) query = query.eq('assigned_driver_id', driverId);

  const updatedSince = url.searchParams.get('updated_since');
  if (updatedSince) {
    if (Number.isNaN(Date.parse(updatedSince))) {
      return apiError('validation_failed', 'updated_since must be an ISO 8601 timestamp.');
    }
    query = query.gte('updated_at', new Date(updatedSince).toISOString());
  }

  const search = sanitizeSearchTerm(url.searchParams.get('search') ?? '');
  if (search) {
    query = query.or(
      `registration_number.ilike.%${search}%,make.ilike.%${search}%,model.ilike.%${search}%`,
    );
  }

  const sortParam = url.searchParams.get('sort') ?? 'registration_number';
  const desc = sortParam.startsWith('-');
  const sortField = desc ? sortParam.slice(1) : sortParam;
  if (!(SORTABLE as readonly string[]).includes(sortField)) {
    return apiError('validation_failed', `sort must be one of: ${SORTABLE.join(', ')} (prefix with "-" to reverse).`);
  }

  const { data, error, count } = await query
    .order(sortField, { ascending: !desc })
    .range(page.offset, page.offset + page.limit - 1);

  if (error) {
    console.error('[api/v1] list vehicles failed:', error);
    return apiError('internal_error', 'Could not load vehicles.');
  }

  return apiSuccess((data ?? []).map(serializeVehicle), { meta: pageMeta(page, count) });
});

/**
 * POST /api/v1/vehicles — add a vehicle.
 *
 * Refuses with 402 `plan_limit` at the plan's vehicle cap, and with 409
 * `conflict` if the registration is already on the platform (registrations are
 * unique across Rovora, not just within a fleet).
 */
export const POST = withApiAuth('vehicles:write', async (req: NextRequest, ctx: ApiContext) => {
  const parsed = await readJsonBody(req);
  if ('response' in parsed) return parsed.response;
  const body = parsed.value;

  const errs = new FieldErrors();
  rejectUnknownFields(errs, body, VEHICLE_WRITABLE_FIELDS);
  const registration = requiredString(errs, body, 'registration_number', 32);
  const make = requiredString(errs, body, 'make', 60);
  const model = requiredString(errs, body, 'model', 60);
  const payload = buildVehiclePayload(errs, body);
  if (errs.any) return errs.response();

  const admin = createAdminClient();

  if (typeof payload.assigned_driver_id === 'string') {
    const owned = await ensureDriverInFleet(admin, ctx.organizationId, payload.assigned_driver_id);
    if (!owned) {
      errs.add('assigned_driver_id', 'is not a driver in this fleet');
      return errs.response();
    }
  }

  const capacity = await checkApiCapacity(ctx.organizationId, 'vehicles');
  if (!capacity.ok) {
    return apiError('plan_limit', capacity.message, {
      details: { current: capacity.current, cap: capacity.cap, required_plan: capacity.requiredPlan },
    });
  }

  const { data, error } = await admin
    .from('vehicles')
    .insert({
      ...payload,
      organization_id: ctx.organizationId,
      registration_number: registration,
      make,
      model,
      mileage: payload.mileage ?? 0,
    })
    .select(VEHICLE_COLUMNS)
    .single();

  if (error) {
    if (error.code === '23505') {
      return apiError('conflict', 'A vehicle with that registration number already exists.');
    }
    console.error('[api/v1] create vehicle failed:', error);
    return apiError('internal_error', 'Could not create the vehicle.');
  }

  return apiSuccess(serializeVehicle(data), { status: 201 });
});
