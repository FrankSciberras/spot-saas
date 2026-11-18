import { MIGRATION_HINT, driverDmsAllowed, isMissingMigration, jsonError, noStore, requireChatActor } from '@/lib/messages/server';

/** GET /api/messages/settings — the fleet's chat settings (Settings → Messages tab). */
export async function GET() {
  const ctx = await requireChatActor();
  if ('response' in ctx) return ctx.response;
  const { actor, admin } = ctx;
  return noStore({ settings: { driverDms: await driverDmsAllowed(admin, actor.organizationId) } });
}

/** PATCH /api/messages/settings — fleet chat settings. Fleet admins only. */
export async function PATCH(request: Request) {
  const ctx = await requireChatActor();
  if ('response' in ctx) return ctx.response;
  const { actor, admin } = ctx;
  if (!actor.isAdmin) return jsonError(403, 'Only fleet admins can change chat settings.');

  const body = (await request.json().catch(() => ({}))) as { driverDms?: unknown };
  if (typeof body.driverDms !== 'boolean') return jsonError(400, 'Nothing to update.');

  const { error } = await admin
    .from('organizations')
    .update({ chat_driver_dms: body.driverDms, updated_at: new Date().toISOString() })
    .eq('id', actor.organizationId);
  if (error) {
    if (isMissingMigration(error)) return jsonError(503, MIGRATION_HINT);
    console.error('[messages] settings update failed:', error);
    return jsonError(500, 'Could not save the setting.');
  }
  return noStore({ settings: { driverDms: body.driverDms } });
}
