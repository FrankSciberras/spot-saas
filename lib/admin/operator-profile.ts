// =============================================================================
// OPERATOR PROFILE LOADER (platform-admin, server-only)
// =============================================================================
// Gathers the full picture of a single operator (fleet) for the admin detail
// page at /admin/operators/[id] — subscription & billing state, the modules they
// have switched on, and their vehicles, drivers and members. Everything here is
// REAL data from the DB (no Stripe API call): billing history itself lives in
// Stripe, reached via the `stripeUrl` deep-link. Runs on the service-role client
// so the platform admin can read any fleet regardless of membership.
// =============================================================================

import { createAdminClient } from '@/lib/supabase/server';
import { getAllPlans } from '@/lib/billing/plans-data';
import { FLEET_MODULES, resolveEnabledModules } from '@/lib/modules/catalog';
import { stripeCustomerUrl } from '@/lib/billing/stripe-dashboard';

export interface ProfileVehicle {
  id: string;
  registration: string;
  make: string;
  model: string;
  year: number | null;
  status: string;
  assignedDriver: string | null;
}
export interface ProfileDriver {
  id: string;
  fullName: string;
  status: string;
  assignedVehicle: string | null;
}
export interface ProfileMember {
  userId: string;
  email: string;
  fullName: string | null;
  role: string;
}
export interface ProfileModule {
  key: string;
  name: string;
  tagline: string;
  icon: string;
  category: string;
  status: 'available' | 'coming-soon';
  enabled: boolean;
}

export interface OperatorProfile {
  id: string;
  name: string;
  slug: string;
  /** Raw organizations.status: active | suspended | cancelled. */
  status: string;
  // Plan / billing.
  plan: string;
  planName: string;
  planColor: string;
  /** Flat monthly rate for the plan, EUR (0 for trial). */
  planPrice: number;
  capLabel: string | null;
  maxDrivers: number | null;
  maxVehicles: number | null;
  /** True when this operator contributes recurring revenue right now. */
  isPaying: boolean;
  mrr: number;
  /** Raw Stripe subscription status mirror, if they checked out via Stripe. */
  subscriptionStatus: string | null;
  /** Renewal / expiry ISO — Stripe period end, else next monthly anniversary. */
  renewsAt: string | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  planActivatedAt: string | null;
  createdAt: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  /** Deep-link to this customer in the Stripe dashboard, or null. */
  stripeUrl: string | null;
  // Collections.
  counts: { vehicles: number; drivers: number; members: number };
  vehicles: ProfileVehicle[];
  drivers: ProfileDriver[];
  members: ProfileMember[];
  modules: ProfileModule[];
}

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  plan_activated_at: string | null;
  created_at: string;
}

/** Next monthly anniversary of `iso` relative to now (mirrors the console). */
function nextRenewal(iso: string | null): string | null {
  if (!iso) return null;
  const start = new Date(iso);
  const now = new Date();
  const r = new Date(now.getFullYear(), now.getMonth(), start.getDate());
  if (r.getTime() <= now.getTime()) r.setMonth(r.getMonth() + 1);
  return r.toISOString();
}

/**
 * Load an operator's full profile, or null when the id doesn't exist. Caller
 * must already have gated the request to a platform admin.
 */
export async function getOperatorProfile(organizationId: string): Promise<OperatorProfile | null> {
  const admin = createAdminClient();

  const [{ data: orgRaw }, planRows] = await Promise.all([
    admin
      .from('organizations')
      .select(
        'id, name, slug, status, plan, subscription_status, current_period_end, stripe_customer_id, stripe_subscription_id, trial_started_at, trial_ends_at, plan_activated_at, created_at',
      )
      .eq('id', organizationId)
      .maybeSingle(),
    getAllPlans(),
  ]);

  const org = orgRaw as OrgRow | null;
  if (!org) return null;

  const [{ data: memsRaw }, { data: driversRaw }, { data: vehiclesRaw }, { data: modRaw }] =
    await Promise.all([
      admin.from('memberships').select('user_id, role').eq('organization_id', organizationId),
      admin
        .from('drivers')
        .select('id, full_name, status, assigned_vehicle_id')
        .eq('organization_id', organizationId)
        .order('full_name', { ascending: true }),
      admin
        .from('vehicles')
        .select('id, registration_number, make, model, year, status, assigned_driver_id')
        .eq('organization_id', organizationId)
        .order('registration_number', { ascending: true }),
      admin.from('org_modules').select('module_key, is_enabled').eq('organization_id', organizationId),
    ]);

  const mems = (memsRaw as { user_id: string; role: string }[] | null) ?? [];
  const driverRows =
    (driversRaw as
      | { id: string; full_name: string; status: string; assigned_vehicle_id: string | null }[]
      | null) ?? [];
  const vehicleRows =
    (vehiclesRaw as
      | {
          id: string;
          registration_number: string;
          make: string;
          model: string;
          year: number | null;
          status: string;
          assigned_driver_id: string | null;
        }[]
      | null) ?? [];

  // Resolve member emails/names.
  const memberIds = mems.map((m) => m.user_id);
  const userById = new Map<string, { email: string; full_name: string | null }>();
  if (memberIds.length) {
    const { data: users } = await admin.from('users').select('id, email, full_name').in('id', memberIds);
    for (const u of (users as { id: string; email: string; full_name: string | null }[] | null) ?? [])
      userById.set(u.id, { email: u.email, full_name: u.full_name });
  }

  // Cross-reference driver ↔ vehicle assignments for friendly labels.
  const driverNameById = new Map(driverRows.map((d) => [d.id, d.full_name]));
  const vehicleRegById = new Map(vehicleRows.map((v) => [v.id, v.registration_number]));

  const vehicles: ProfileVehicle[] = vehicleRows.map((v) => ({
    id: v.id,
    registration: v.registration_number,
    make: v.make,
    model: v.model,
    year: v.year,
    status: v.status,
    assignedDriver: v.assigned_driver_id ? driverNameById.get(v.assigned_driver_id) ?? null : null,
  }));
  const drivers: ProfileDriver[] = driverRows.map((d) => ({
    id: d.id,
    fullName: d.full_name,
    status: d.status,
    assignedVehicle: d.assigned_vehicle_id ? vehicleRegById.get(d.assigned_vehicle_id) ?? null : null,
  }));

  const roleOrder: Record<string, number> = { admin: 0, staff: 1, driver: 2 };
  const members: ProfileMember[] = mems
    .map((m) => ({
      userId: m.user_id,
      email: userById.get(m.user_id)?.email ?? '—',
      fullName: userById.get(m.user_id)?.full_name ?? null,
      role: m.role,
    }))
    .sort((a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9) || a.email.localeCompare(b.email));

  // Modules: catalog entries with this fleet's on/off state merged in.
  const enabled = resolveEnabledModules(
    (modRaw as { module_key: string; is_enabled: boolean }[] | null) ?? [],
  );
  const modules: ProfileModule[] = FLEET_MODULES.map((m) => ({
    key: m.key,
    name: m.name,
    tagline: m.tagline,
    icon: m.icon,
    category: m.category,
    status: m.status,
    enabled: enabled.has(m.key),
  }));

  // Plan meta from the catalogue.
  const planKey = org.plan ?? 'trial';
  const planRow = planRows.find((p) => p.key === planKey);
  const planPrice = planRow ? Number(planRow.price_amount) || 0 : 0;
  const isPaying = planKey !== 'trial' && org.status !== 'cancelled';

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status,
    plan: planKey,
    planName: planRow?.name ?? (planKey === 'trial' ? 'Trial' : planKey),
    planColor: planRow?.color ?? 'var(--text-2)',
    planPrice,
    capLabel: planRow?.cap_label ?? null,
    maxDrivers: planRow?.max_drivers ?? null,
    maxVehicles: planRow?.max_vehicles ?? null,
    isPaying,
    mrr: isPaying && org.status === 'active' ? planPrice : 0,
    subscriptionStatus: org.subscription_status,
    renewsAt: org.current_period_end ?? nextRenewal(org.plan_activated_at ?? org.created_at),
    trialStartedAt: org.trial_started_at,
    trialEndsAt: org.trial_ends_at,
    planActivatedAt: org.plan_activated_at,
    createdAt: org.created_at,
    stripeCustomerId: org.stripe_customer_id,
    stripeSubscriptionId: org.stripe_subscription_id,
    stripeUrl: stripeCustomerUrl(org.stripe_customer_id),
    counts: { vehicles: vehicles.length, drivers: drivers.length, members: members.length },
    vehicles,
    drivers,
    members,
    modules,
  };
}
