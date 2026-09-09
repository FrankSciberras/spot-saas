// =============================================================================
// NOTIFICATION RULES ENGINE (server only) — automated, time-based alerts.
// =============================================================================
// Sweeps each org's ACTIVE notification_rules and fires the time-based ones that
// match right now. Covers three triggers:
//
//   * document_expiry  — a document expiring within trigger_config.days_before
//                        (default 30), OR already expired (raised once more, as
//                        an "Expired:" alert, for up to EXPIRED_GRACE_DAYS).
//                        Sources: the driver's own *_expiry_date columns +
//                        driver-owned rows in `files`, PLUS the vehicles'
//                        insurance/road-licence expiry columns and vehicle-owned
//                        files (those facts go to admins).
//   * shift_reminder   — a shift starting within trigger_config.hours_before
//                        (default 24).
//   * service_due      — a vehicle approaching (or past) its next service, by
//                        km (trigger_config.km_threshold, default 1000, against
//                        the latest service's next_service_mileage) or by date
//                        (trigger_config.days_before, default 14). "Latest
//                        service" is decided by lib/maintenance/serviceDue.ts —
//                        the same rule the Services page and the shift-start
//                        check use, so they can't disagree.
//
// Delivery reuses the existing senders (in-app insert + web-push + email) and
// honours each rule's `channel` and `target_role` — facts without a driver
// (vehicle docs, service due) always route to admins.
//
// Dedup: every fact is keyed PER RULE (`<rule id>:<fact key>`) in the
// notification_dedup table, so two document rules with different windows (say
// 30 days and 7 days) each fire once. Keys written before this per-rule scheme
// are honoured too, so nothing already sent is repeated. Dedup rows are only
// written AFTER the in-app rows were stored successfully — a failed insert is
// retried on the next run instead of being silently lost.
//
// Event-based triggers (roster_published / roster_updated) are NOT handled here —
// those fire inline when a roster is published.
// =============================================================================

import { createAdminClient } from '@/lib/supabase/server';
import { sendPushNotification } from '@/lib/notifications/push';
import { sendEmailNotification } from '@/lib/notifications/email';
import { latestServiceByVehicle } from '@/lib/maintenance/serviceDue';

type AdminClient = ReturnType<typeof createAdminClient>;
type Channel = 'app' | 'push' | 'email';

export interface EngineReport {
  orgsProcessed: number;
  rulesEvaluated: number;
  created: number; // in-app notifications inserted
  push: number;
  email: number;
  skippedDuplicates: number;
  errors: string[];
}

interface Rule {
  id: string;
  organization_id: string;
  trigger_type: string;
  channel: string;
  trigger_config: Record<string, unknown> | null;
  title_template: string;
  body_template: string;
  target_role: string | null;
}

/** A single thing worth alerting about, plus how to address it. */
interface Fact {
  /** Rule-independent key; processOrg prefixes it with the rule id. */
  dedupKey: string;
  vars: Record<string, string | number>;
  driver?: { id: string; userId: string | null; email: string | null; name: string };
  /** >0 when the document has already expired (days since expiry). */
  expiredDays?: number;
}

const DAY = 86_400_000;
const HOUR = 3_600_000;
const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || 'Europe/Malta';
/** Keep raising (once) an "expired" alert for documents that lapsed up to this long ago. */
const EXPIRED_GRACE_DAYS = 90;

const DOC_LABELS: Record<string, string> = {
  id_card_expiry_date: 'ID card',
  police_conduct_expiry_date: 'Police conduct certificate',
  driving_license_expiry_date: 'Driving licence',
  tag_license_expiry_date: 'Tag licence',
};

const FILE_TYPE_LABELS: Record<string, string> = {
  ID_CARD: 'ID card',
  ID_CARD_FRONT: 'ID card',
  ID_CARD_BACK: 'ID card',
  POLICE_CONDUCT: 'Police conduct certificate',
  DRIVING_LICENSE: 'Driving licence',
  DRIVING_LICENSE_FRONT: 'Driving licence',
  DRIVING_LICENSE_BACK: 'Driving licence',
  VEHICLE_INSURANCE: 'Vehicle insurance',
  ROAD_LICENSE: 'Road licence',
  TAG_LICENSE: 'Tag licence',
  OTHER: 'Document',
};

function channelsOf(c: string): Channel[] {
  return c === 'all' ? ['app', 'push', 'email'] : [c as Channel];
}

/** Replace {{var}} tokens; unknown tokens collapse to ''. */
function render(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => (k in vars ? String(vars[k]) : ''));
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { timeZone: TIME_ZONE, day: '2-digit', month: 'short', year: 'numeric' });
}

function asNumber(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 'YYYY-MM-DD' of an instant in the fleet's time zone. */
function localDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: TIME_ZONE });
}

/** The calendar date of a stored expiry (date or timestamp string), or null. */
function dateOnly(iso: string): string | null {
  const s = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Whole days from `from` to `to` (both 'YYYY-MM-DD'); positive when `to` is later. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
}

interface ExpiryClass {
  kind: 'soon' | 'expired';
  daysLeft: number;
  expiredDays: number;
}

/**
 * Where a document sits relative to today (fleet-local date):
 *   - expiring within `daysBefore` days (today counts, 0 days left) → 'soon'
 *   - already expired, up to EXPIRED_GRACE_DAYS ago                 → 'expired'
 *   - otherwise nothing to say.
 * Dates are compared as calendar days, so a document dated today still alerts
 * even though midnight has passed — the old instant comparison dropped it.
 */
function classifyExpiry(iso: string | null, today: string, daysBefore: number): ExpiryClass | null {
  if (!iso) return null;
  const doc = dateOnly(iso);
  if (!doc) return null;
  const diff = daysBetween(today, doc);
  if (diff < 0) {
    const expiredDays = -diff;
    if (expiredDays > EXPIRED_GRACE_DAYS) return null;
    return { kind: 'expired', daysLeft: 0, expiredDays };
  }
  if (diff <= daysBefore) return { kind: 'soon', daysLeft: diff, expiredDays: 0 };
  return null;
}

// ── Evaluators ──────────────────────────────────────────────────────────────

interface OrgContext {
  drivers: { id: string; full_name: string; user_id: string | null; email: string | null }[];
  driverById: Map<string, OrgContext['drivers'][number]>;
}

type FileRow = { owner_id: string; type: string; expiry_date: string | null; file_name: string | null };

function documentExpiryFacts(rule: Rule, ctx: OrgContext, files: FileRow[], now: Date): Fact[] {
  const daysBefore = asNumber(rule.trigger_config?.days_before, 30);
  const today = localDateStr(now);
  const facts: Fact[] = [];

  // Driver expiry columns.
  for (const d of ctx.drivers) {
    const driver = { id: d.id, userId: d.user_id, email: d.email, name: d.full_name };
    for (const [col, label] of Object.entries(DOC_LABELS)) {
      const iso = (d as unknown as Record<string, string | null>)[col];
      const c = classifyExpiry(iso, today, daysBefore);
      if (!c || !iso) continue;
      facts.push({
        dedupKey: `docexp:driver:${d.id}:${col}:${iso}${c.kind === 'expired' ? ':expired' : ''}`,
        driver,
        expiredDays: c.expiredDays,
        vars: { driver_name: d.full_name, document_type: label, expiry_date: fmtDate(iso), days_left: c.daysLeft, vehicle_reg: '' },
      });
    }
  }

  // Driver-owned files with an expiry date.
  for (const f of files) {
    const c = classifyExpiry(f.expiry_date, today, daysBefore);
    if (!c || !f.expiry_date) continue;
    const d = ctx.driverById.get(f.owner_id);
    if (!d) continue;
    const label = FILE_TYPE_LABELS[f.type] || f.file_name || 'Document';
    facts.push({
      dedupKey: `docexp:file:${f.owner_id}:${f.type}:${f.expiry_date}${c.kind === 'expired' ? ':expired' : ''}`,
      driver: { id: d.id, userId: d.user_id, email: d.email, name: d.full_name },
      expiredDays: c.expiredDays,
      vars: { driver_name: d.full_name, document_type: label, expiry_date: fmtDate(f.expiry_date), days_left: c.daysLeft, vehicle_reg: '' },
    });
  }

  return facts;
}

interface VehicleRow {
  id: string;
  registration_number: string;
  make: string | null;
  model: string | null;
  mileage: number | null;
  insurance_expiry_date: string | null;
  road_license_expiry_date: string | null;
}

const VEHICLE_DOC_LABELS: Record<string, string> = {
  insurance_expiry_date: 'vehicle insurance',
  road_license_expiry_date: 'road licence',
};

/** Vehicle documents (expiry columns + vehicle-owned files) — admin-facing. */
function vehicleDocumentExpiryFacts(rule: Rule, vehicles: VehicleRow[], vehicleFiles: FileRow[], now: Date): Fact[] {
  const daysBefore = asNumber(rule.trigger_config?.days_before, 30);
  const today = localDateStr(now);
  const facts: Fact[] = [];
  const regById = new Map(vehicles.map((v) => [v.id, v.registration_number]));

  for (const v of vehicles) {
    for (const [col, label] of Object.entries(VEHICLE_DOC_LABELS)) {
      const iso = (v as unknown as Record<string, string | null>)[col];
      const c = classifyExpiry(iso, today, daysBefore);
      if (!c || !iso) continue;
      facts.push({
        dedupKey: `docexp:vehicle:${v.id}:${col}:${iso}${c.kind === 'expired' ? ':expired' : ''}`,
        expiredDays: c.expiredDays,
        vars: { driver_name: '', document_type: `${label} for ${v.registration_number}`, expiry_date: fmtDate(iso), days_left: c.daysLeft, vehicle_reg: v.registration_number },
      });
    }
  }

  for (const f of vehicleFiles) {
    const c = classifyExpiry(f.expiry_date, today, daysBefore);
    if (!c || !f.expiry_date) continue;
    const reg = regById.get(f.owner_id);
    if (!reg) continue;
    const label = FILE_TYPE_LABELS[f.type] || f.file_name || 'Document';
    facts.push({
      dedupKey: `docexp:vfile:${f.owner_id}:${f.type}:${f.expiry_date}${c.kind === 'expired' ? ':expired' : ''}`,
      expiredDays: c.expiredDays,
      vars: { driver_name: '', document_type: `${label} for ${reg}`, expiry_date: fmtDate(f.expiry_date), days_left: c.daysLeft, vehicle_reg: reg },
    });
  }

  return facts;
}

type ServiceTarget = { id: string; next_service_mileage: number | null; next_service_date: string | null };

/**
 * Vehicles approaching (or past) their next service — admin-facing. Uses the
 * LATEST service record per vehicle that sets a next-service target (see
 * lib/maintenance/serviceDue.ts for how "latest" is decided). A vehicle fires
 * when its mileage is within km_threshold of next_service_mileage, or
 * next_service_date is within days_before (or already past).
 */
function serviceDueFacts(rule: Rule, vehicles: VehicleRow[], latest: Map<string, ServiceTarget>, now: Date): Fact[] {
  const kmThreshold = asNumber(rule.trigger_config?.km_threshold, 1000);
  const daysBefore = asNumber(rule.trigger_config?.days_before, 14);
  const horizon = new Date(now.getTime() + daysBefore * DAY);
  const facts: Fact[] = [];

  for (const v of vehicles) {
    const svc = latest.get(v.id);
    if (!svc) continue;
    const vehicleName = [v.make, v.model].filter(Boolean).join(' ');

    // km-based: within threshold of (or past) the next service mileage.
    if (svc.next_service_mileage != null && v.mileage != null) {
      const kmLeft = svc.next_service_mileage - v.mileage;
      if (kmLeft <= kmThreshold) {
        const dueInfo = kmLeft >= 0
          ? `in ~${kmLeft.toLocaleString('en-GB')} km (at ${svc.next_service_mileage.toLocaleString('en-GB')} km)`
          : `overdue by ${Math.abs(kmLeft).toLocaleString('en-GB')} km (was due at ${svc.next_service_mileage.toLocaleString('en-GB')} km)`;
        facts.push({
          dedupKey: `svcdue:km:${v.id}:${svc.id}:${svc.next_service_mileage}`,
          vars: {
            vehicle_reg: v.registration_number,
            vehicle_name: vehicleName,
            next_service_mileage: svc.next_service_mileage,
            current_mileage: v.mileage,
            km_left: Math.max(0, kmLeft),
            next_service_date: svc.next_service_date ? fmtDate(svc.next_service_date) : '',
            days_left: '',
            due_info: dueInfo,
            driver_name: '',
          },
        });
        continue; // one fact per vehicle per sweep is enough
      }
    }

    // date-based: due within the window, or already overdue.
    if (svc.next_service_date) {
      const due = new Date(svc.next_service_date);
      if (!Number.isNaN(due.getTime()) && due <= horizon) {
        const days = Math.ceil((due.getTime() - now.getTime()) / DAY);
        const dueInfo = days >= 0
          ? `on ${fmtDate(svc.next_service_date)} (${days} day${days === 1 ? '' : 's'} left)`
          : `overdue since ${fmtDate(svc.next_service_date)}`;
        facts.push({
          dedupKey: `svcdue:date:${v.id}:${svc.id}:${svc.next_service_date}`,
          vars: {
            vehicle_reg: v.registration_number,
            vehicle_name: vehicleName,
            next_service_mileage: svc.next_service_mileage ?? '',
            current_mileage: v.mileage ?? '',
            km_left: '',
            next_service_date: fmtDate(svc.next_service_date),
            days_left: Math.max(0, days),
            due_info: dueInfo,
            driver_name: '',
          },
        });
      }
    }
  }

  return facts;
}

function shiftReminderFacts(
  rule: Rule,
  ctx: OrgContext,
  shifts: { id: string; driver_id: string; vehicle_id: string | null; name: string | null; start_time: string }[],
  vehicleReg: Map<string, string>,
  now: Date
): Fact[] {
  const hoursBefore = asNumber(rule.trigger_config?.hours_before, 24);
  const horizon = new Date(now.getTime() + hoursBefore * HOUR);
  const facts: Fact[] = [];

  for (const s of shifts) {
    const start = new Date(s.start_time);
    if (Number.isNaN(start.getTime()) || start <= now || start > horizon) continue;
    const d = ctx.driverById.get(s.driver_id);
    if (!d) continue;
    const reg = s.vehicle_id ? vehicleReg.get(s.vehicle_id) ?? '' : '';
    const hoursUntil = Math.max(1, Math.round((start.getTime() - now.getTime()) / HOUR));
    facts.push({
      dedupKey: `shiftrem:${s.id}`,
      driver: { id: d.id, userId: d.user_id, email: d.email, name: d.full_name },
      vars: {
        driver_name: d.full_name,
        shift_name: s.name ?? 'your shift',
        vehicle_reg: reg,
        // Fleet-local time — the server runs in UTC, and "starts 06:00" for an
        // 08:00 Malta shift is exactly the kind of alert drivers stop trusting.
        start_time: start.toLocaleString('en-GB', {
          timeZone: TIME_ZONE,
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }),
        hours_until: hoursUntil,
      },
    });
  }
  return facts;
}

// ── Main ────────────────────────────────────────────────────────────────────

export async function evaluateNotificationRules(opts: { orgId?: string; now?: Date } = {}): Promise<EngineReport> {
  const admin = createAdminClient();
  const now = opts.now ?? new Date();
  const report: EngineReport = { orgsProcessed: 0, rulesEvaluated: 0, created: 0, push: 0, email: 0, skippedDuplicates: 0, errors: [] };

  // Active time-based rules, grouped by org.
  let ruleQuery = admin
    .from('notification_rules')
    .select('id, organization_id, trigger_type, channel, trigger_config, title_template, body_template, target_role')
    .eq('is_active', true)
    .in('trigger_type', ['document_expiry', 'shift_reminder', 'service_due']);
  if (opts.orgId) ruleQuery = ruleQuery.eq('organization_id', opts.orgId);

  const { data: ruleRows, error: ruleErr } = await ruleQuery;
  if (ruleErr) {
    report.errors.push(`load rules: ${ruleErr.message}`);
    return report;
  }
  const rules = (ruleRows ?? []) as Rule[];
  const byOrg = new Map<string, Rule[]>();
  for (const r of rules) {
    if (!byOrg.has(r.organization_id)) byOrg.set(r.organization_id, []);
    byOrg.get(r.organization_id)!.push(r);
  }

  for (const [orgId, orgRules] of byOrg) {
    try {
      await processOrg(admin, orgId, orgRules, now, report);
      report.orgsProcessed++;
    } catch (err) {
      report.errors.push(`org ${orgId}: ${(err as Error).message}`);
    }
  }

  return report;
}

interface Candidate {
  rule: Rule;
  fact: Fact;
  /** Per-rule dedup key actually stored: `<rule id>:<fact key>`. */
  key: string;
  /** The pre-per-rule key format, honoured so already-sent alerts don't repeat. */
  legacyKey: string;
}

async function processOrg(admin: AdminClient, orgId: string, rules: Rule[], now: Date, report: EngineReport) {
  // Org context: active drivers + their emails.
  const { data: driverRows } = await admin
    .from('drivers')
    .select('id, full_name, user_id, status, id_card_expiry_date, police_conduct_expiry_date, driving_license_expiry_date, tag_license_expiry_date')
    .eq('organization_id', orgId)
    .eq('status', 'active');
  const driversRaw = (driverRows ?? []) as Record<string, string | null>[];

  const userIds = Array.from(new Set(driversRaw.map((d) => d.user_id).filter(Boolean) as string[]));
  const emailById = new Map<string, string>();
  if (userIds.length) {
    const { data: us } = await admin.from('users').select('id, email').in('id', userIds);
    for (const u of (us ?? []) as { id: string; email: string }[]) emailById.set(u.id, u.email);
  }

  const drivers = driversRaw.map((d) => ({
    id: d.id as string,
    full_name: (d.full_name as string) ?? 'Driver',
    user_id: (d.user_id as string | null) ?? null,
    email: d.user_id ? emailById.get(d.user_id as string) ?? null : null,
    // keep expiry columns accessible via the raw object cast in the evaluator
    id_card_expiry_date: d.id_card_expiry_date ?? null,
    police_conduct_expiry_date: d.police_conduct_expiry_date ?? null,
    driving_license_expiry_date: d.driving_license_expiry_date ?? null,
    tag_license_expiry_date: d.tag_license_expiry_date ?? null,
  }));
  const ctx: OrgContext = { drivers, driverById: new Map(drivers.map((d) => [d.id, d])) };

  // Admin/staff users (for admin-targeted rules) — lazy. Includes drivers who
  // also hold staff access in this fleet.
  let adminUsersCache: { id: string; email: string }[] | null = null;
  const adminUsers = async () => {
    if (adminUsersCache) return adminUsersCache;
    const { data: mems } = await admin
      .from('memberships')
      .select('user_id')
      .eq('organization_id', orgId)
      .or('role.in.(admin,staff),also_staff.eq.true');
    const ids = Array.from(new Set(((mems ?? []) as { user_id: string }[]).map((m) => m.user_id)));
    if (!ids.length) { adminUsersCache = []; return adminUsersCache; }
    const { data: us } = await admin.from('users').select('id, email').in('id', ids);
    adminUsersCache = (us ?? []) as { id: string; email: string }[];
    return adminUsersCache;
  };

  // Build all candidate facts for this org.
  const candidates: Candidate[] = [];

  const needDocs = rules.some((r) => r.trigger_type === 'document_expiry');
  const needShifts = rules.some((r) => r.trigger_type === 'shift_reminder');
  const needService = rules.some((r) => r.trigger_type === 'service_due');

  let files: FileRow[] = [];
  let vehicleFiles: FileRow[] = [];
  if (needDocs) {
    const { data: fileRows } = await admin
      .from('files')
      .select('owner_id, type, expiry_date, file_name')
      .eq('organization_id', orgId)
      .eq('owner_type', 'driver')
      .not('expiry_date', 'is', null);
    files = (fileRows ?? []) as FileRow[];

    const { data: vFileRows } = await admin
      .from('files')
      .select('owner_id, type, expiry_date, file_name')
      .eq('organization_id', orgId)
      .eq('owner_type', 'vehicle')
      .not('expiry_date', 'is', null);
    vehicleFiles = (vFileRows ?? []) as FileRow[];
  }

  // Vehicles power both the vehicle-document sweep and service-due checks.
  let vehicles: VehicleRow[] = [];
  if (needDocs || needService) {
    const { data: vehicleRows } = await admin
      .from('vehicles')
      .select('id, registration_number, make, model, mileage, insurance_expiry_date, road_license_expiry_date')
      .eq('organization_id', orgId);
    vehicles = (vehicleRows ?? []) as VehicleRow[];
  }

  // Latest service per vehicle that sets a next-service target (km or date) —
  // decided by the shared rule in lib/maintenance/serviceDue.ts.
  let latestService = new Map<string, ServiceTarget>();
  if (needService) {
    const { data: svcRows } = await admin
      .from('vehicle_services')
      .select('id, vehicle_id, service_date, mileage_at_service, next_service_mileage, next_service_date')
      .eq('organization_id', orgId)
      .or('next_service_mileage.not.is.null,next_service_date.not.is.null');
    latestService = latestServiceByVehicle(
      (svcRows ?? []) as { id: string; vehicle_id: string; service_date: string | null; mileage_at_service: number | null; next_service_mileage: number | null; next_service_date: string | null }[]
    );
  }

  let shifts: { id: string; driver_id: string; vehicle_id: string | null; name: string | null; start_time: string }[] = [];
  const vehicleReg = new Map<string, string>();
  if (needShifts) {
    const horizonMax = new Date(now.getTime() + 14 * DAY).toISOString(); // generous upper bound
    const { data: shiftRows } = await admin
      .from('driver_shifts')
      .select('id, driver_id, vehicle_id, name, start_time')
      .eq('organization_id', orgId)
      .gt('start_time', now.toISOString())
      .lt('start_time', horizonMax);
    shifts = (shiftRows ?? []) as typeof shifts;

    const vids = Array.from(new Set(shifts.map((s) => s.vehicle_id).filter(Boolean) as string[]));
    if (vids.length) {
      const { data: vs } = await admin.from('vehicles').select('id, registration_number').in('id', vids);
      for (const v of (vs ?? []) as { id: string; registration_number: string }[]) vehicleReg.set(v.id, v.registration_number);
    }
  }

  for (const rule of rules) {
    report.rulesEvaluated++;
    const facts =
      rule.trigger_type === 'document_expiry'
        ? [...documentExpiryFacts(rule, ctx, files, now), ...vehicleDocumentExpiryFacts(rule, vehicles, vehicleFiles, now)]
        : rule.trigger_type === 'shift_reminder'
          ? shiftReminderFacts(rule, ctx, shifts, vehicleReg, now)
          : rule.trigger_type === 'service_due'
            ? serviceDueFacts(rule, vehicles, latestService, now)
            : [];
    for (const fact of facts) {
      candidates.push({ rule, fact, key: `${rule.id}:${fact.dedupKey}`, legacyKey: fact.dedupKey });
    }
  }

  if (candidates.length === 0) return;

  // Dedup: drop anything already sent for this org — under the per-rule key OR
  // the older rule-less key.
  const keys = Array.from(new Set(candidates.flatMap((c) => [c.key, c.legacyKey])));
  const existing = new Set<string>();
  for (let i = 0; i < keys.length; i += 200) {
    const slice = keys.slice(i, i + 200);
    const { data } = await admin.from('notification_dedup').select('dedup_key').eq('organization_id', orgId).in('dedup_key', slice);
    for (const row of (data ?? []) as { dedup_key: string }[]) existing.add(row.dedup_key);
  }

  const seen = new Set<string>(); // in-batch duplicate keys
  const fresh = candidates.filter((c) => {
    if (existing.has(c.key) || existing.has(c.legacyKey) || seen.has(c.key)) return false;
    seen.add(c.key);
    return true;
  });
  report.skippedDuplicates += candidates.length - fresh.length;
  if (fresh.length === 0) return;

  // Phase 1 — decide what each fact sends.
  interface Plan {
    c: Candidate;
    title: string;
    body: string;
    chans: Channel[];
    toDriver: boolean;
    toAdmin: boolean;
  }
  const nowIso = now.toISOString();
  const plans: Plan[] = [];
  const notifRows: Record<string, unknown>[] = [];

  for (const c of fresh) {
    const { rule, fact } = c;
    const chans = channelsOf(rule.channel);
    let title = render(rule.title_template, fact.vars);
    let body = render(rule.body_template, fact.vars);
    if (fact.expiredDays) {
      // Same rule/template, but make it unmistakable that this is past due.
      if (!/expired/i.test(title)) title = `Expired: ${title}`;
      const ago = fact.expiredDays === 1 ? 'yesterday' : `${fact.expiredDays} days ago`;
      body = `${body} This document expired ${ago} and must be renewed.`;
    }
    const role = rule.target_role ?? 'driver';
    const toDriver = (role === 'driver' || role === 'all') && !!fact.driver;
    // Facts with no driver attached (vehicle documents, service due) can only
    // meaningfully go to the fleet team, whatever the rule's target says.
    const toAdmin = role === 'admin' || role === 'all' || !fact.driver;
    plans.push({ c, title, body, chans, toDriver, toAdmin });

    if (chans.includes('app')) {
      if (toDriver && fact.driver) {
        notifRows.push({ organization_id: orgId, driver_id: fact.driver.id, title, body, type: fact.expiredDays ? 'alert' : 'warning', action_url: '/driver/notifications', target_role: 'driver', sent_at: nowIso, created_at: nowIso });
      }
      if (toAdmin) {
        notifRows.push({ organization_id: orgId, driver_id: null, title, body, type: fact.expiredDays ? 'alert' : 'warning', action_url: '/fleet/notifications', target_role: 'admin', sent_at: nowIso, created_at: nowIso });
      }
    }
  }

  // Phase 2 — store the in-app rows FIRST. If this fails nothing else goes out
  // and nothing is marked as sent, so the next run retries the whole batch.
  if (notifRows.length) {
    const { error } = await admin.from('notifications').insert(notifRows);
    if (error) {
      report.errors.push(`org ${orgId} notifications insert failed (${notifRows.length} rows, will retry next run): ${error.message}`);
      return;
    }
    report.created += notifRows.length;
  }

  // Phase 3 — push + email.
  for (const p of plans) {
    const { fact } = p.c;
    if (p.toDriver && fact.driver) {
      if (p.chans.includes('push') && fact.driver.userId) {
        try { if (await sendPushNotification(fact.driver.userId, { title: p.title, body: p.body, url: '/driver/notifications' })) report.push++; } catch { /* ignore */ }
      }
      if (p.chans.includes('email') && fact.driver.email) {
        try { if (await sendEmailNotification({ to: fact.driver.email, subject: p.title, body: p.body, driverName: fact.driver.name })) report.email++; } catch { /* ignore */ }
      }
    }
    if (p.toAdmin && (p.chans.includes('push') || p.chans.includes('email'))) {
      const recips = await adminUsers();
      for (const u of recips) {
        if (p.chans.includes('push')) { try { if (await sendPushNotification(u.id, { title: p.title, body: p.body, url: '/fleet/notifications' })) report.push++; } catch { /* ignore */ } }
        if (p.chans.includes('email')) { try { if (await sendEmailNotification({ to: u.email, subject: p.title, body: p.body })) report.email++; } catch { /* ignore */ } }
      }
    }
  }

  // Phase 4 — only now record the facts as sent.
  const dedupRows = plans.map((p) => ({ organization_id: orgId, rule_id: p.c.rule.id, dedup_key: p.c.key, sent_at: nowIso }));
  const logRows = plans.map((p) => ({ organization_id: orgId, rule_id: p.c.rule.id, channel: p.c.rule.channel, title: p.title, body: p.body, status: 'sent', metadata: { dedup_key: p.c.key }, sent_at: nowIso }));

  const { error: dedupError } = await admin.from('notification_dedup').insert(dedupRows);
  if (dedupError) report.errors.push(`org ${orgId} dedup insert: ${dedupError.message}`);
  const { error: logError } = await admin.from('notification_log').insert(logRows);
  if (logError) report.errors.push(`org ${orgId} log insert: ${logError.message}`);
}
