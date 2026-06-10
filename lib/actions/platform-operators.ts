'use server';

// =============================================================================
// PLATFORM-ADMIN OPERATOR MANAGEMENT (Tier 1 — the SaaS operator)
// =============================================================================
// Lets the platform admin (Frank) create a brand-new operator (organization)
// directly from /admin — on a fresh 30-day trial by default, or on any package
// from the catalogue — and optionally attach/invite an owner by email. Runs on
// the service-role client so it can write orgs/memberships the admin isn't a
// member of, mirroring create_organization_with_owner() but admin-initiated.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requirePlatformAdmin } from '@/lib/auth/platform';
import { TRIAL_DAYS, TRIAL_PLAN } from '@/lib/billing/plans';

type Result = { error?: string; ok?: boolean; warning?: string; organizationId?: string };

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Resolve an email to a user id, inviting a brand-new account if needed.
 * Returns the id (or null on invite failure) plus an optional warning.
 */
async function resolveOrInviteUser(
  admin: AdminClient,
  email: string
): Promise<{ id: string | null; warning?: string }> {
  const { data: existing } = await admin.from('users').select('id').eq('email', email).maybeSingle();
  if (existing?.id) return { id: existing.id as string };

  try {
    const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email);
    if (error || !invited?.user) throw error ?? new Error('no user returned');
    await admin.from('users').upsert({ id: invited.user.id, email, role: 'admin' }, { onConflict: 'id' });
    return { id: invited.user.id };
  } catch (err) {
    console.error('resolveOrInviteUser invite failed:', err);
    return { id: null, warning: `Could not send an invite to ${email}.` };
  }
}

export interface CreateOperatorInput {
  name: string;
  /** 'trial' (default) or a published package key. */
  plan?: string;
  /** Trial length in days (only when plan === 'trial'). Defaults to TRIAL_DAYS. */
  trialDays?: number;
  /** Optional owner — attached if they already have an account, else invited. */
  ownerEmail?: string;
}

export async function createOperatorAction(input: CreateOperatorInput): Promise<Result> {
  await requirePlatformAdmin();

  const name = input.name?.trim();
  if (!name) return { error: 'Give the operator a name.' };

  const plan = (input.plan || TRIAL_PLAN).trim();
  const ownerEmail = input.ownerEmail?.trim().toLowerCase() || '';
  if (ownerEmail && !EMAIL_RE.test(ownerEmail)) {
    return { error: 'Enter a valid owner email, or leave it blank.' };
  }

  const admin = createAdminClient();

  // Validate a paid plan against the catalogue (trial is the built-in state).
  if (plan !== TRIAL_PLAN) {
    const { data: planRow } = await admin.from('plans').select('key').eq('key', plan).maybeSingle();
    if (!planRow) return { error: 'Unknown plan.' };
  }

  // Unique slug (append -2, -3, … on collision).
  const base = slugify(name) || 'fleet';
  let slug = base;
  for (let i = 2; ; i++) {
    const { data: existing } = await admin.from('organizations').select('id').eq('slug', slug).maybeSingle();
    if (!existing) break;
    slug = `${base}-${i}`;
  }

  // Plan / trial timestamps.
  const now = new Date();
  const patch: Record<string, unknown> = { name, slug, plan, status: 'active' };
  if (plan === TRIAL_PLAN) {
    const days = Number.isFinite(input.trialDays) && (input.trialDays as number) > 0 ? (input.trialDays as number) : TRIAL_DAYS;
    patch.trial_started_at = now.toISOString();
    patch.trial_ends_at = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  } else {
    patch.plan_activated_at = now.toISOString();
  }

  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert(patch)
    .select('id')
    .single();

  if (orgErr || !org) {
    console.error('createOperatorAction (org) failed:', orgErr);
    return { error: 'Could not create the operator.' };
  }
  const organizationId = org.id as string;

  // Give the new fleet a working set of default notification rules.
  await admin.rpc('seed_default_notification_rules', { p_org: organizationId });

  // Owner (optional) — attach an existing account, or invite a new one.
  let warning: string | undefined;
  if (ownerEmail) {
    const resolved = await resolveOrInviteUser(admin, ownerEmail);
    if (!resolved.id) {
      warning = `Operator created, but the owner invite to ${ownerEmail} could not be sent. They can be added once they sign up.`;
    } else {
      const { error: memErr } = await admin
        .from('memberships')
        .upsert(
          { organization_id: organizationId, user_id: resolved.id, role: 'admin' },
          { onConflict: 'organization_id,user_id' }
        );
      if (memErr) {
        console.error('createOperatorAction (membership) failed:', memErr);
        warning = 'Operator created, but the owner could not be attached. Add them from the operator’s members.';
      }
    }
  }

  revalidatePath('/admin');
  return { ok: true, organizationId, warning };
}

// =============================================================================
// EDIT / MEMBERS / LIFECYCLE
// =============================================================================

export interface OperatorMember {
  userId: string;
  email: string;
  fullName: string | null;
  role: string;
  alsoStaff: boolean;
}

export interface OperatorDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  trialEndsAt: string | null;
  planActivatedAt: string | null;
  createdAt: string;
  members: OperatorMember[];
}

/** Load an operator's editable details + members (platform-admin only). */
export async function getOperatorDetailAction(
  organizationId: string
): Promise<{ error?: string; detail?: OperatorDetail }> {
  await requirePlatformAdmin();
  const admin = createAdminClient();

  const { data: org, error } = await admin
    .from('organizations')
    .select('id, name, slug, status, plan, trial_ends_at, plan_activated_at, created_at')
    .eq('id', organizationId)
    .single();

  if (error || !org) return { error: 'Operator not found.' };

  const { data: mems } = await admin
    .from('memberships')
    .select('user_id, role, also_staff')
    .eq('organization_id', organizationId);

  const rows = (mems as { user_id: string; role: string; also_staff: boolean }[] | null) ?? [];
  const ids = rows.map((m) => m.user_id);
  const emailById = new Map<string, { email: string; full_name: string | null }>();
  if (ids.length) {
    const { data: users } = await admin.from('users').select('id, email, full_name').in('id', ids);
    for (const u of (users as { id: string; email: string; full_name: string | null }[] | null) ?? []) {
      emailById.set(u.id, { email: u.email, full_name: u.full_name });
    }
  }

  const members: OperatorMember[] = rows.map((m) => ({
    userId: m.user_id,
    email: emailById.get(m.user_id)?.email ?? '—',
    fullName: emailById.get(m.user_id)?.full_name ?? null,
    role: m.role,
    alsoStaff: m.also_staff,
  }));
  // Admins first, then staff, then drivers; stable by email within a role.
  const order: Record<string, number> = { admin: 0, staff: 1, driver: 2 };
  members.sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9) || a.email.localeCompare(b.email));

  return {
    detail: {
      id: org.id as string,
      name: org.name as string,
      slug: org.slug as string,
      status: org.status as string,
      plan: org.plan as string,
      trialEndsAt: (org.trial_ends_at as string | null) ?? null,
      planActivatedAt: (org.plan_activated_at as string | null) ?? null,
      createdAt: org.created_at as string,
      members,
    },
  };
}

/** Rename an operator and/or change its slug (slug kept unique). */
export async function updateOperatorAction(
  organizationId: string,
  input: { name?: string; slug?: string }
): Promise<Result> {
  await requirePlatformAdmin();
  const admin = createAdminClient();

  const patch: Record<string, unknown> = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) return { error: 'Name cannot be empty.' };
    patch.name = name;
  }

  if (input.slug !== undefined) {
    const slug = slugify(input.slug);
    if (!slug) return { error: 'Slug must contain letters or numbers.' };
    const { data: clash } = await admin
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .neq('id', organizationId)
      .maybeSingle();
    if (clash) return { error: 'That slug is already taken.' };
    patch.slug = slug;
  }

  if (Object.keys(patch).length === 0) return { ok: true };

  patch.updated_at = new Date().toISOString();
  const { error } = await admin.from('organizations').update(patch).eq('id', organizationId);
  if (error) {
    console.error('updateOperatorAction failed:', error);
    return { error: 'Could not save the operator.' };
  }

  revalidatePath('/admin');
  return { ok: true };
}

/**
 * Set an exact trial end date (puts the fleet on the trial plan, active). Pass
 * null to clear it. Useful for granting/adjusting a bespoke trial window.
 */
export async function setOperatorTrialEndAction(
  organizationId: string,
  isoDate: string | null
): Promise<Result> {
  await requirePlatformAdmin();
  const admin = createAdminClient();

  let trialEnds: string | null = null;
  if (isoDate) {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return { error: 'Invalid date.' };
    trialEnds = d.toISOString();
  }

  const { error } = await admin
    .from('organizations')
    .update({
      plan: TRIAL_PLAN,
      status: 'active',
      trial_started_at: new Date().toISOString(),
      trial_ends_at: trialEnds,
      plan_activated_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', organizationId);

  if (error) {
    console.error('setOperatorTrialEndAction failed:', error);
    return { error: 'Could not update the trial.' };
  }

  revalidatePath('/admin');
  return { ok: true };
}

/** Add a member to an operator by email (attaches existing or invites). */
export async function addOperatorMemberAction(
  organizationId: string,
  email: string,
  role: 'admin' | 'staff'
): Promise<Result> {
  await requirePlatformAdmin();
  const clean = email?.trim().toLowerCase() || '';
  if (!EMAIL_RE.test(clean)) return { error: 'Enter a valid email.' };
  if (role !== 'admin' && role !== 'staff') return { error: 'Invalid role.' };

  const admin = createAdminClient();
  const resolved = await resolveOrInviteUser(admin, clean);
  if (!resolved.id) return { error: resolved.warning ?? 'Could not add that member.' };

  const { error } = await admin
    .from('memberships')
    .upsert(
      { organization_id: organizationId, user_id: resolved.id, role },
      { onConflict: 'organization_id,user_id' }
    );
  if (error) {
    console.error('addOperatorMemberAction failed:', error);
    return { error: 'Could not add that member.' };
  }

  revalidatePath('/admin');
  return { ok: true };
}

/** Count admins so we never orphan an operator. */
async function adminCount(admin: AdminClient, organizationId: string): Promise<number> {
  const { count } = await admin
    .from('memberships')
    .select('user_id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('role', 'admin');
  return count ?? 0;
}

/** Change a member's role (admin|staff). Refuses to demote the last admin. */
export async function setOperatorMemberRoleAction(
  organizationId: string,
  userId: string,
  role: 'admin' | 'staff'
): Promise<Result> {
  await requirePlatformAdmin();
  if (role !== 'admin' && role !== 'staff') return { error: 'Invalid role.' };

  const admin = createAdminClient();
  const { data: current } = await admin
    .from('memberships')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!current) return { error: 'Member not found.' };
  if (current.role === 'admin' && role !== 'admin' && (await adminCount(admin, organizationId)) <= 1) {
    return { error: 'This is the only admin — promote someone else first.' };
  }

  const { error } = await admin
    .from('memberships')
    .update({ role })
    .eq('organization_id', organizationId)
    .eq('user_id', userId);
  if (error) {
    console.error('setOperatorMemberRoleAction failed:', error);
    return { error: 'Could not change the role.' };
  }

  revalidatePath('/admin');
  return { ok: true };
}

/** Remove a member from an operator. Refuses to remove the last admin. */
export async function removeOperatorMemberAction(
  organizationId: string,
  userId: string
): Promise<Result> {
  await requirePlatformAdmin();
  const admin = createAdminClient();

  const { data: current } = await admin
    .from('memberships')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!current) return { ok: true }; // already gone
  if (current.role === 'admin' && (await adminCount(admin, organizationId)) <= 1) {
    return { error: 'This is the only admin — add another admin before removing them.' };
  }

  const { error } = await admin
    .from('memberships')
    .delete()
    .eq('organization_id', organizationId)
    .eq('user_id', userId);
  if (error) {
    console.error('removeOperatorMemberAction failed:', error);
    return { error: 'Could not remove that member.' };
  }

  revalidatePath('/admin');
  return { ok: true };
}

/** Set an operator's lifecycle status (active | suspended | cancelled). */
export async function setOperatorStatusAction(
  organizationId: string,
  status: 'active' | 'suspended' | 'cancelled'
): Promise<Result> {
  await requirePlatformAdmin();
  if (!['active', 'suspended', 'cancelled'].includes(status)) return { error: 'Invalid status.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('organizations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', organizationId);
  if (error) {
    console.error('setOperatorStatusAction failed:', error);
    return { error: 'Could not update the status.' };
  }

  revalidatePath('/admin');
  return { ok: true };
}

/**
 * Permanently delete an operator and ALL its data (drivers, vehicles,
 * memberships, etc. cascade via ON DELETE CASCADE). User accounts are global
 * and are left intact. This is irreversible.
 */
export async function deleteOperatorAction(organizationId: string): Promise<Result> {
  await requirePlatformAdmin();
  const admin = createAdminClient();

  const { error } = await admin.from('organizations').delete().eq('id', organizationId);
  if (error) {
    console.error('deleteOperatorAction failed:', error);
    return { error: 'Could not delete the operator.' };
  }

  revalidatePath('/admin');
  return { ok: true };
}
