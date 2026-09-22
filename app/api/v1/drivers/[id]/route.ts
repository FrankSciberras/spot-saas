import type { NextRequest } from 'next/server';
import { withApiAuth, readJsonBody, type ApiContext } from '@/lib/api/auth';
import { apiError, apiNoContent, apiSuccess } from '@/lib/api/respond';
import { createAdminClient } from '@/lib/supabase/server';
import { DRIVER_COLUMNS, serializeDriver } from '@/lib/api/serializers';
import {
  DRIVER_WRITABLE_FIELDS,
  buildDriverPayload,
  ensureVehicleInFleet,
} from '@/lib/api/resources/drivers';
import { FieldErrors, isUuid, rejectUnknownFields } from '@/lib/api/validate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteCtx = { params: Promise<{ id: string }> };

/** GET /api/v1/drivers/{id} */
export const GET = withApiAuth<RouteCtx>(
  'drivers:read',
  async (_req: NextRequest, ctx: ApiContext, route: RouteCtx) => {
    const { id } = await route.params;
    if (!isUuid(id)) return apiError('not_found', 'No driver with that id.');

    const admin = createAdminClient();
    const { data, error } = await admin
      .from('drivers')
      .select(DRIVER_COLUMNS)
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();

    if (error) {
      console.error('[api/v1] get driver failed:', error);
      return apiError('internal_error', 'Could not load the driver.');
    }
    if (!data) return apiError('not_found', 'No driver with that id.');

    return apiSuccess(serializeDriver(data));
  },
);

/**
 * PATCH /api/v1/drivers/{id} — partial update.
 *
 * Only the fields present in the body are changed; everything else is left
 * alone. PUT is deliberately not offered: a full replacement invites an
 * integration to blank out fields it does not know about.
 */
export const PATCH = withApiAuth<RouteCtx>(
  'drivers:write',
  async (req: NextRequest, ctx: ApiContext, route: RouteCtx) => {
    const { id } = await route.params;
    if (!isUuid(id)) return apiError('not_found', 'No driver with that id.');

    const parsed = await readJsonBody(req);
    if ('response' in parsed) return parsed.response;
    const body = parsed.value;

    const errs = new FieldErrors();
    rejectUnknownFields(errs, body, DRIVER_WRITABLE_FIELDS);
    // Relinking a driver to a different login is an account operation, not a
    // data edit — it stays in the dashboard where the membership is managed.
    if ('user_id' in body) errs.add('user_id', 'cannot be changed after the driver is created');
    const payload = buildDriverPayload(errs, body);
    delete payload.user_id;
    if (errs.any) return errs.response();

    if (Object.keys(payload).length === 0) {
      return apiError('validation_failed', 'Supply at least one field to update.');
    }

    const admin = createAdminClient();

    if (typeof payload.assigned_vehicle_id === 'string') {
      const owned = await ensureVehicleInFleet(admin, ctx.organizationId, payload.assigned_vehicle_id);
      if (!owned) {
        errs.add('assigned_vehicle_id', 'is not a vehicle in this fleet');
        return errs.response();
      }
    }

    payload.updated_at = new Date().toISOString();

    const { data, error } = await admin
      .from('drivers')
      .update(payload)
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .select(DRIVER_COLUMNS)
      .maybeSingle();

    if (error) {
      console.error('[api/v1] update driver failed:', error);
      return apiError('internal_error', 'Could not update the driver.');
    }
    if (!data) return apiError('not_found', 'No driver with that id.');

    return apiSuccess(serializeDriver(data));
  },
);

/**
 * DELETE /api/v1/drivers/{id} — remove a driver record.
 *
 * Only drivers with NO linked Rovora login can be deleted over the API. A
 * driver who has an account can only be removed in the dashboard, because
 * doing it properly also closes their login — deleting a person's account
 * should take a human clicking a button, not a stray script. To take a linked
 * driver off the road, PATCH `status` to `inactive` instead.
 */
export const DELETE = withApiAuth<RouteCtx>(
  'drivers:write',
  async (_req: NextRequest, ctx: ApiContext, route: RouteCtx) => {
    const { id } = await route.params;
    if (!isUuid(id)) return apiError('not_found', 'No driver with that id.');

    const admin = createAdminClient();
    const { data: driver } = await admin
      .from('drivers')
      .select('id, user_id')
      .eq('id', id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();

    if (!driver) return apiError('not_found', 'No driver with that id.');

    if (driver.user_id) {
      return apiError(
        'conflict',
        'This driver has a Rovora login. Remove them from the Drivers page in Rovora, or PATCH status to "inactive" to deactivate them here.',
      );
    }

    const { error } = await admin
      .from('drivers')
      .delete()
      .eq('id', id)
      .eq('organization_id', ctx.organizationId);

    if (error) {
      console.error('[api/v1] delete driver failed:', error);
      return apiError('internal_error', 'Could not delete the driver.');
    }

    return apiNoContent();
  },
);
