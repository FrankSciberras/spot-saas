import type { NextRequest } from 'next/server';
import { withApiAuth, readJsonBody, type ApiContext } from '@/lib/api/auth';
import { apiError, apiNoContent, apiSuccess } from '@/lib/api/respond';
import { createAdminClient } from '@/lib/supabase/server';
import { VEHICLE_COLUMNS, serializeVehicle } from '@/lib/api/serializers';
import { VEHICLE_WRITABLE_FIELDS, buildVehiclePayload } from '@/lib/api/resources/vehicles';
import { ensureDriverInFleet } from '@/lib/api/resources/drivers';
import { FieldErrors, isUuid, rejectUnknownFields } from '@/lib/api/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

/** GET /api/v1/vehicles/{id} */
export const GET = withApiAuth<RouteCtx>(
  'vehicles:read',
  async (_req: NextRequest, ctx: ApiContext, route: RouteCtx) => {
    const { id } = await route.params;
    if (!isUuid(id)) return apiError('not_found', 'No vehicle with that id.');

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('vehicles')
      .select(VEHICLE_COLUMNS)
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();

    if (error) {
      console.error('[api/v1] get vehicle failed:', error);
      return apiError('internal_error', 'Could not load the vehicle.');
    }
    if (!data) return apiError('not_found', 'No vehicle with that id.');

    return apiSuccess(serializeVehicle(data));
  },
);

/** PATCH /api/v1/vehicles/{id} — partial update. */
export const PATCH = withApiAuth<RouteCtx>(
  'vehicles:write',
  async (req: NextRequest, ctx: ApiContext, route: RouteCtx) => {
    const { id } = await route.params;
    if (!isUuid(id)) return apiError('not_found', 'No vehicle with that id.');

    const parsed = await readJsonBody(req);
    if ('response' in parsed) return parsed.response;
    const body = parsed.value;

    const errs = new FieldErrors();
    rejectUnknownFields(errs, body, VEHICLE_WRITABLE_FIELDS);
    const payload = buildVehiclePayload(errs, body);
    if (errs.any) return errs.response();

    if (Object.keys(payload).length === 0) {
      return apiError('validation_failed', 'Supply at least one field to update.');
    }

    const admin = createAdminClient();

    if (typeof payload.assigned_driver_id === 'string') {
      const owned = await ensureDriverInFleet(admin, ctx.organizationId, payload.assigned_driver_id);
      if (!owned) {
        errs.add('assigned_driver_id', 'is not a driver in this fleet');
        return errs.response();
      }
    }

    payload.updated_at = new Date().toISOString();

    const { data, error } = await admin
      .from('vehicles')
      .update(payload)
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .select(VEHICLE_COLUMNS)
      .maybeSingle();

    if (error) {
      if (error.code === '23505') {
        return apiError('conflict', 'A vehicle with that registration number already exists.');
      }
      console.error('[api/v1] update vehicle failed:', error);
      return apiError('internal_error', 'Could not update the vehicle.');
    }
    if (!data) return apiError('not_found', 'No vehicle with that id.');

    return apiSuccess(serializeVehicle(data));
  },
);

/**
 * DELETE /api/v1/vehicles/{id} — remove a vehicle.
 *
 * The vehicle's financial history is NOT deleted: transactions that reference
 * it keep their amounts and simply lose the link, exactly as the dashboard
 * behaves. Selling a car must not erase the money spent on it.
 */
export const DELETE = withApiAuth<RouteCtx>(
  'vehicles:write',
  async (_req: NextRequest, ctx: ApiContext, route: RouteCtx) => {
    const { id } = await route.params;
    if (!isUuid(id)) return apiError('not_found', 'No vehicle with that id.');

    const admin = createAdminClient();
    const { data: existing } = await admin
      .from('vehicles')
      .select('id')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();

    if (!existing) return apiError('not_found', 'No vehicle with that id.');

    const { error } = await admin
      .from('vehicles')
      .delete()
      .eq('id', id)
      .eq('organization_id', ctx.organizationId);

    if (error) {
      // A restrict-style FK (an open service record, a shift in progress) is a
      // conflict the caller can act on, not a server fault.
      if (error.code === '23503') {
        return apiError(
          'conflict',
          'This vehicle still has records attached to it and cannot be deleted. Set its status to "out_of_service" instead.',
        );
      }
      console.error('[api/v1] delete vehicle failed:', error);
      return apiError('internal_error', 'Could not delete the vehicle.');
    }

    return apiNoContent();
  },
);
