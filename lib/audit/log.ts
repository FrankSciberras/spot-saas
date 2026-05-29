import { createAdminClient } from '@/lib/supabase/server';
import type { UserRole } from '@/lib/types/database';

export interface AuditActor {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  also_staff: boolean;
}

export interface CreateAuditLogInput {
  actor: AuditActor | null;
  action: 'create' | 'update' | 'delete';
  entityType: string;
  entityId?: string | null;
  summary: string;
  details?: Record<string, unknown> | null;
  /**
   * The organization the action happened in. Audit logs are written via the
   * admin client (bypasses RLS + the auto-stamp trigger), so the org must be
   * supplied. If omitted, it is resolved from the actor's sole membership —
   * correct for single-fleet users; multi-fleet callers SHOULD pass it
   * explicitly (e.g. session.organization_id) to record the right fleet.
   */
  organizationId?: string;
}

export async function getAuditActor(userId: string): Promise<AuditActor | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, email, full_name, role, also_staff')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as AuditActor;
}

export function isStaffAuditActor(actor: AuditActor | null): boolean {
  if (!actor) return false;
  return actor.role === 'staff' || (actor.role === 'driver' && actor.also_staff);
}

export function hasStaffDashboardAccess(actor: AuditActor | null): boolean {
  if (!actor) return false;
  return actor.role === 'admin' || actor.role === 'staff' || (actor.role === 'driver' && actor.also_staff);
}

/**
 * Resolves the organization id for an admin-client write that bypasses the
 * auto-stamp trigger. Prefers an explicit id; otherwise falls back to the
 * actor's sole membership (returns null if the actor belongs to 0 or >1 orgs).
 */
async function resolveActorOrgId(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  explicit?: string
): Promise<string | null> {
  if (explicit) return explicit;
  const { data } = await supabase
    .from('memberships')
    .select('organization_id')
    .eq('user_id', userId);
  if (data && data.length === 1) return data[0].organization_id as string;
  return null;
}

export async function createAuditLogEntry({ actor, action, entityType, entityId, summary, details, organizationId }: CreateAuditLogInput) {
  if (!isStaffAuditActor(actor)) {
    return;
  }

  const safeActor = actor as AuditActor;
  const supabase = createAdminClient();
  const actorRole = safeActor.role === 'driver' && safeActor.also_staff ? 'driver+staff' : safeActor.role;

  const orgId = await resolveActorOrgId(supabase, safeActor.id, organizationId);
  if (!orgId) {
    console.error(
      `Skipping audit log: could not resolve organization for actor ${safeActor.id} ` +
      `(pass organizationId explicitly for multi-fleet users).`
    );
    return;
  }

  const { error } = await supabase
    .from('audit_logs')
    .insert({
      organization_id: orgId,
      actor_user_id: safeActor.id,
      actor_email: safeActor.email,
      actor_name: safeActor.full_name,
      actor_role: actorRole,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      summary,
      details: details || null,
    });

  if (error) {
    console.error('Failed to write audit log entry:', error);
  }
}
