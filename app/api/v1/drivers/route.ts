import type { NextRequest } from 'next/server';
import { withApiAuth, readJsonBody, type ApiContext } from '@/lib/api/auth';
import { apiError, apiSuccess } from '@/lib/api/respond';
import { createAdminClient } from '@/lib/supabase/server';
import { checkApiCapacity } from '@/lib/api/capacity';
import { DRIVER_COLUMNS, serializeDriver } from '@/lib/api/serializers';
import {
  DRIVER_WRITABLE_FIELDS,
  buildDriverPayload,
  ensureVehicleInFleet,
} from '@/lib/api/resources/drivers';
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

const SORTABLE = ['full_name', 'created_at', 'updated_at', 'status'] as const;

/**
 * GET /api/v1/drivers — list the fleet's drivers.
 *
 * Filters: `status`, `employment_type`, `assigned_vehicle_id`, `search`
 * (name or phone), `updated_since` (ISO timestamp — the cheap way to run an
 * incremental sync). Paginated with `limit` / `offset`.
 */
export const GET = withApiAuth('drivers:read', async (req: NextRequest, ctx: ApiContext) => {
  const url = new URL(req.url);
  const page = readPagination(url);
  const admin = createAdminClient();

  let query = admin
    .from('drivers')
    .select(DRIVER_COLUMNS, { count: 'exact' })
    // The tenant filter. Never from the URL — always from the authenticated key.
    .eq('organization_id', ctx.organizationId);

  const status = url.searchParams.get('status');
  if (status) query = query.eq('status', status);

  const employment = url.searchParams.get('employment_type');
  if (employment) query = query.eq('employment_type', employment);

  const vehicleId = url.searchParams.get('assigned_vehicle_id');
  if (vehicleId) query = query.eq('assigned_vehicle_id', vehicleId);

  const updatedSince = url.searchParams.get('updated_since');
  if (updatedSince) {
    if (Number.isNaN(Date.parse(updatedSince))) {
      return apiError('validation_failed', 'updated_since must be an ISO 8601 timestamp.');
    }
    query = query.gte('updated_at', new Date(updatedSince).toISOString());
  }

  const search = sanitizeSearchTerm(url.searchParams.get('search') ?? '');
  if (search) {
    query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  const sortParam = url.searchParams.get('sort') ?? 'full_name';
  const desc = sortParam.startsWith('-');
  const sortField = desc ? sortParam.slice(1) : sortParam;
  if (!(SORTABLE as readonly string[]).includes(sortField)) {
    return apiError('validation_failed', `sort must be one of: ${SORTABLE.join(', ')} (prefix with "-" to reverse).`);
  }

  const { data, error, count } = await query
    .order(sortField, { ascending: !desc })
    .range(page.offset, page.offset + page.limit - 1);

  if (error) {
    console.error('[api/v1] list drivers failed:', error);
    return apiError('internal_error', 'Could not load drivers.');
  }

  return apiSuccess((data ?? []).map(serializeDriver), { meta: pageMeta(page, count) });
});

/**
 * POST /api/v1/drivers — create a driver.
 *
 * `user_id` is optional: pass the id of an existing fleet member to link the
 * driver to a Rovora login (so they can use the driver app), or leave it out to
 * create a record-only driver synced from another system.
 *
 * Refuses with 402 `plan_limit` when the fleet is already at its plan's driver
 * cap, exactly as the dashboard does.
 */
export const POST = withApiAuth('drivers:write', async (req: NextRequest, ctx: ApiContext) => {
  const parsed = await readJsonBody(req);
  if ('response' in parsed) return parsed.response;
  const body = parsed.value;

  const errs = new FieldErrors();
  rejectUnknownFields(errs, body, DRIVER_WRITABLE_FIELDS);
  const fullName = requiredString(errs, body, 'full_name', 200);
  const payload = buildDriverPayload(errs, body);
  if (errs.any) return errs.response();

  const admin = createAdminClient();

  // A linked account must already be a member of THIS fleet, or an API key
  // could attach someone else's user to its own org.
  if (typeof payload.user_id === 'string') {
    const { data: membership } = await admin
      .from('memberships')
      .select('user_id')
      .eq('organization_id', ctx.organizationId)
      .eq('user_id', payload.user_id)
      .maybeSingle();
    if (!membership) {
      errs.add('user_id', 'is not a member of this fleet');
      return errs.response();
    }
  }

  if (typeof payload.assigned_vehicle_id === 'string') {
    const owned = await ensureVehicleInFleet(admin, ctx.organizationId, payload.assigned_vehicle_id);
    if (!owned) {
      errs.add('assigned_vehicle_id', 'is not a vehicle in this fleet');
      return errs.response();
    }
  }

  const capacity = await checkApiCapacity(ctx.organizationId, 'drivers');
  if (!capacity.ok) {
    return apiError('plan_limit', capacity.message, {
      details: { current: capacity.current, cap: capacity.cap, required_plan: capacity.requiredPlan },
    });
  }

  const { data, error } = await admin
    .from('drivers')
    .insert({ ...payload, organization_id: ctx.organizationId, full_name: fullName })
    .select(DRIVER_COLUMNS)
    .single();

  if (error) {
    if (error.code === '23505') {
      return apiError('conflict', 'That user already has a driver record.');
    }
    console.error('[api/v1] create driver failed:', error);
    return apiError('internal_error', 'Could not create the driver.');
  }

  return apiSuccess(serializeDriver(data), { status: 201 });
});
