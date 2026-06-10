// =============================================================================
// NOTIFICATION RULES ENGINE (server only) — automated, time-based alerts.
// =============================================================================
// Sweeps each org's ACTIVE notification_rules and fires the time-based ones that
// match right now. First iteration covers two triggers:
//
//   * document_expiry  — a driver document expiring within trigger_config
//                        .days_before (default 30). Sources: the driver's own
//                        *_expiry_date columns + driver-owned rows in `files`.
//   * shift_reminder   — a shift starting within trigger_config.hours_before
//                        (default 24).
//
// Delivery reuses the existing senders (in-app insert + web-push + email) and
// honours each rule's `channel` and `target_role`. Every fact is deduped via the
// notification_dedup table so a daily run never re-sends the same alert.
//
// Event-based triggers (roster_published / roster_updated) are NOT handled here —
// those should fire inline when a roster is published. service_due / weekly_summary
// are deferred to a later pass.
// =============================================================================

import { createAdminClient } from '@/lib/supabase/server';
import { sendPushNotification } from '@/lib/notifications/push';
import { sendEmailNotification } from '@/lib/notifications/email';

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
  dedupKey: string;
  vars: Record<string, string | number>;
  driver?: { id: string; userId: string | null; email: string | null; name: string };
}

const DAY = 86_400_000;
const HOUR = 3_600_000;

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
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function asNumber(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ── Evaluators ──────────────────────────────────────────────────────────────

interface OrgContext {
  drivers: { id: string; full_name: string; user_id: string | null; email: string | null }[];
  driverById: Map<string, OrgContext['drivers'][number]>;
}

function documentExpiryFacts(rule: Rule, ctx: OrgContext, files: { owner_id: string; type: string; expiry_date: string | null; file_name: string | null }[], now: Date): Fact[] {
  const daysBefore = asNumber(rule.trigger_config?.days_before, 30);
  const horizon = new Date(now.getTime() + daysBefore * DAY);
  const facts: Fact[] = [];

  const within = (iso: string | null): boolean => {
    if (!iso) return false;
    const d = new Date(iso);
    return !Number.isNaN(d.getTime()) && d >= now && d <= horizon;
  };
  const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / DAY));

  // Driver expiry columns.
  for (const d of ctx.drivers) {
    const driver = { id: d.id, userId: d.user_id, email: d.email, name: d.full_name };
    for (const [col, label] of Object.entries(DOC_LABELS)) {
      const iso = (d as unknown as Record<string, string | null>)[col];
      if (!within(iso)) continue;
      facts.push({
        dedupKey: `docexp:driver:${d.id}:${col}:${iso}`,
        driver,
        vars: { driver_name: d.full_name, document_type: label, expiry_date: fmtDate(iso!), days_left: daysLeft(iso!), vehicle_reg: '' },
      });
    }
  }

  // Driver-owned files with an expiry date.
  for (const f of files) {
    if (!within(f.expiry_date)) continue;
    const d = ctx.driverById.get(f.owner_id);
    if (!d) continue;
    const label = FILE_TYPE_LABELS[f.type] || f.file_name || 'Document';
    facts.push({
      dedupKey: `docexp:file:${f.owner_id}:${f.type}:${f.expiry_date}`,
      driver: { id: d.id, userId: d.user_id, email: d.email, name: d.full_name },
      vars: { driver_name: d.full_name, document_type: label, expiry_date: fmtDate(f.expiry_date!), days_left: daysLeft(f.expiry_date!), vehicle_reg: '' },
    });
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
        start_time: new Date(s.start_time).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
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
    .in('trigger_type', ['document_expiry', 'shift_reminder']);
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

  // Admin/staff users (for admin-targeted rules) — lazy.
  let adminUsersCache: { id: string; email: string }[] | null = null;
  const adminUsers = async () => {
    if (adminUsersCache) return adminUsersCache;
    const { data: mems } = await admin.from('memberships').select('user_id').eq('organization_id', orgId).in('role', ['admin', 'staff']);
    const ids = Array.from(new Set(((mems ?? []) as { user_id: string }[]).map((m) => m.user_id)));
    if (!ids.length) { adminUsersCache = []; return adminUsersCache; }
    const { data: us } = await admin.from('users').select('id, email').in('id', ids);
    adminUsersCache = (us ?? []) as { id: string; email: string }[];
    return adminUsersCache;
  };

  // Build all candidate facts for this org.
  const candidates: { rule: Rule; fact: Fact }[] = [];

  const needDocs = rules.some((r) => r.trigger_type === 'document_expiry');
  const needShifts = rules.some((r) => r.trigger_type === 'shift_reminder');

  let files: { owner_id: string; type: string; expiry_date: string | null; file_name: string | null }[] = [];
  if (needDocs) {
    const { data: fileRows } = await admin
      .from('files')
      .select('owner_id, type, expiry_date, file_name')
      .eq('organization_id', orgId)
      .eq('owner_type', 'driver')
      .not('expiry_date', 'is', null);
    files = (fileRows ?? []) as typeof files;
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
        ? documentExpiryFacts(rule, ctx, files, now)
        : rule.trigger_type === 'shift_reminder'
          ? shiftReminderFacts(rule, ctx, shifts, vehicleReg, now)
          : [];
    for (const fact of facts) candidates.push({ rule, fact });
  }

  if (candidates.length === 0) return;

  // Dedup: drop anything already sent for this org.
  const keys = Array.from(new Set(candidates.map((c) => c.fact.dedupKey)));
  const existing = new Set<string>();
  // chunk the IN() to stay well under limits
  for (let i = 0; i < keys.length; i += 200) {
    const slice = keys.slice(i, i + 200);
    const { data } = await admin.from('notification_dedup').select('dedup_key').eq('organization_id', orgId).in('dedup_key', slice);
    for (const row of (data ?? []) as { dedup_key: string }[]) existing.add(row.dedup_key);
  }

  const fresh = candidates.filter((c) => !existing.has(c.fact.dedupKey));
  report.skippedDuplicates += candidates.length - fresh.length;
  if (fresh.length === 0) return;

  const notifRows: Record<string, unknown>[] = [];
  const dedupRows: Record<string, unknown>[] = [];
  const logRows: Record<string, unknown>[] = [];
  const nowIso = now.toISOString();
  const sentDedup = new Set<string>(); // guard against in-batch duplicate keys

  for (const { rule, fact } of fresh) {
    if (sentDedup.has(fact.dedupKey)) continue;
    sentDedup.add(fact.dedupKey);

    const chans = channelsOf(rule.channel);
    const title = render(rule.title_template, fact.vars);
    const body = render(rule.body_template, fact.vars);
    const role = rule.target_role ?? 'driver';
    const toDriver = (role === 'driver' || role === 'all') && !!fact.driver;
    const toAdmin = role === 'admin' || role === 'all';

    if (toDriver && fact.driver) {
      if (chans.includes('app')) {
        notifRows.push({ organization_id: orgId, driver_id: fact.driver.id, title, body, type: 'warning', action_url: '/driver/notifications', target_role: 'driver', sent_at: nowIso, created_at: nowIso });
        report.created++;
      }
      if (chans.includes('push') && fact.driver.userId) {
        try { if (await sendPushNotification(fact.driver.userId, { title, body, url: '/driver/notifications' })) report.push++; } catch { /* ignore */ }
      }
      if (chans.includes('email') && fact.driver.email) {
        try { if (await sendEmailNotification({ to: fact.driver.email, subject: title, body, driverName: fact.driver.name })) report.email++; } catch { /* ignore */ }
      }
    }

    if (toAdmin) {
      if (chans.includes('app')) {
        notifRows.push({ organization_id: orgId, driver_id: null, title, body, type: 'warning', action_url: '/fleet/notifications', target_role: 'admin', sent_at: nowIso, created_at: nowIso });
        report.created++;
      }
      if (chans.includes('push') || chans.includes('email')) {
        const recips = await adminUsers();
        for (const u of recips) {
          if (chans.includes('push')) { try { if (await sendPushNotification(u.id, { title, body, url: '/fleet/notifications' })) report.push++; } catch { /* ignore */ } }
          if (chans.includes('email')) { try { if (await sendEmailNotification({ to: u.email, subject: title, body })) report.email++; } catch { /* ignore */ } }
        }
      }
    }

    dedupRows.push({ organization_id: orgId, rule_id: rule.id, dedup_key: fact.dedupKey, sent_at: nowIso });
    logRows.push({ organization_id: orgId, rule_id: rule.id, channel: rule.channel, title, body, status: 'sent', metadata: { dedup_key: fact.dedupKey }, sent_at: nowIso });
  }

  if (notifRows.length) {
    const { error } = await admin.from('notifications').insert(notifRows);
    if (error) report.errors.push(`org ${orgId} notifications insert: ${error.message}`);
  }
  if (dedupRows.length) {
    // ignore unique-violation races; not fatal
    const { error } = await admin.from('notification_dedup').insert(dedupRows);
    if (error) report.errors.push(`org ${orgId} dedup insert: ${error.message}`);
  }
  if (logRows.length) {
    await admin.from('notification_log').insert(logRows);
  }
}
