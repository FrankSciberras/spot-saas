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

export async function createAuditLogEntry({ actor, action, entityType, entityId, summary, details }: CreateAuditLogInput) {
  if (!isStaffAuditActor(actor)) {
    return;
  }

  const safeActor = actor as AuditActor;
  const supabase = createAdminClient();
  const actorRole = safeActor.role === 'driver' && safeActor.also_staff ? 'driver+staff' : safeActor.role;

  const { error } = await supabase
    .from('audit_logs')
    .insert({
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
