'use server';

// =============================================================================
// EMAIL CAMPAIGNS (Tier 1 — platform admin newsletters & product updates)
// =============================================================================
// Backs the admin console's "Email campaigns" tab: saved HTML templates, a
// live audience count, a test send to yourself, and the real send — one
// personalised email per recipient through Resend's batch API, from the
// noreply address in EMAIL_FROM.
//
// Marketing sends (the default) skip addresses in email_unsubscribes and carry
// a personal unsubscribe link + one-click List-Unsubscribe headers. Service
// notices (marketing = false) go to everyone in the audience.
//
// Every action re-checks platform-admin access; reads and writes use the
// service-role client because these tables belong to the platform, not a fleet.
// =============================================================================

import { createAdminClient } from '@/lib/supabase/server';
import { requirePlatformAdmin } from '@/lib/auth/platform';
import {
  appName,
  emailFromAddress,
  emailFromName,
  fromWithName,
  isEmailConfigured,
  sendEmailBatch,
  type BatchEmail,
} from '@/lib/email';
import { unsubscribeHeaders, unsubscribeLinks } from '@/lib/email/unsubscribe';
import { appUrl, assetUrl } from '@/lib/urls';
import {
  MAX_CAMPAIGN_RECIPIENTS,
  findUnknownMergeTags,
  htmlToText,
  isValidEmail,
  prepareCampaignHtml,
  renderMergeTags,
  type CampaignAudience,
  type MergeVars,
} from '@/lib/email/campaign-shared';

type AdminClient = ReturnType<typeof createAdminClient>;

const SETUP_MISSING =
  'Email campaigns need a database update first: run supabase/migrations/20261118_email_campaigns.sql in the Supabase SQL editor.';

// ─── Small data helpers ──────────────────────────────────────────────────────

type DbError = { message: string; code?: string } | null;
type Rows<T> = PromiseLike<{ data: T[] | null; error: DbError }>;

class QueryError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

/** "relation does not exist" / "not in the schema cache" — the migration hasn't been run. */
function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message ?? '');
}

/** Read every row, 1000 at a time (PostgREST caps a single response at 1000). */
async function fetchAll<T>(build: (from: number, to: number) => Rows<T>): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; from < 500_000; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new QueryError(error.message, error.code);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** `.in(column, values)` in chunks, so long id lists don't overflow the URL. */
async function selectIn<T>(values: string[], build: (chunk: string[]) => Rows<T>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < values.length; i += 150) {
    const { data, error } = await build(values.slice(i, i + 150));
    if (error) throw new QueryError(error.message, error.code);
    out.push(...(data ?? []));
  }
  return out;
}

interface UserRow { id: string; email: string; full_name: string | null }
interface MemberRow { user_id: string; organization_id: string; role?: string }
interface OrgRow { id: string; name: string; plan: string | null }
interface DriverRow { user_id: string | null; full_name: string | null; organization_id: string; status: string | null }

// ─── Audience resolution ─────────────────────────────────────────────────────

interface Recipient {
  email: string;
  fullName: string;
  fleetName: string;
}

class AudienceError extends Error {}

/**
 * Turn an audience description into a de-duplicated list of addresses, each
 * with the name and fleet used for merge tags. Throws AudienceError with a
 * message fit to show the admin.
 */
async function resolveRecipients(
  admin: AdminClient,
  aud: CampaignAudience,
): Promise<{ recipients: Recipient[]; summary: string }> {
  const orgs = await fetchAll<OrgRow>((a, b) => admin.from('organizations').select('id, name, plan').order('id').range(a, b));
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));

  const byEmail = new Map<string, Recipient>();
  const add = (email: string | null | undefined, fullName: string | null | undefined, fleetName: string | null | undefined) => {
    const e = (email ?? '').trim().toLowerCase();
    if (!e || !isValidEmail(e)) return;
    const existing = byEmail.get(e);
    if (existing) {
      if (!existing.fullName && fullName) existing.fullName = fullName.trim();
      if (!existing.fleetName && fleetName) existing.fleetName = fleetName;
      return;
    }
    byEmail.set(e, { email: e, fullName: (fullName ?? '').trim(), fleetName: fleetName ?? '' });
  };

  const usersByIds = (ids: string[]) =>
    selectIn<UserRow>(ids, (chunk) => admin.from('users').select('id, email, full_name').in('id', chunk));

  let summary = '';

  switch (aud.kind) {
    case 'everyone': {
      const [users, mems] = await Promise.all([
        fetchAll<UserRow>((a, b) => admin.from('users').select('id, email, full_name').order('id').range(a, b)),
        fetchAll<MemberRow>((a, b) =>
          admin.from('memberships').select('user_id, organization_id').order('created_at').order('id').range(a, b),
        ),
      ]);
      const fleetOf = new Map<string, string>();
      for (const m of mems) if (!fleetOf.has(m.user_id)) fleetOf.set(m.user_id, orgName.get(m.organization_id) ?? '');
      for (const u of users) add(u.email, u.full_name, fleetOf.get(u.id));
      summary = 'Everyone';
      break;
    }

    case 'operators': {
      let target = orgs;
      summary = 'All operators';
      if (aud.scope === 'plan') {
        const keys = aud.planKeys ?? [];
        if (keys.length === 0) throw new AudienceError('Select at least one plan.');
        target = orgs.filter((o) => keys.includes(o.plan ?? 'trial'));
        const { data: plans } = await admin.from('plans').select('key, name');
        const planName = new Map(((plans ?? []) as { key: string; name: string }[]).map((p) => [p.key, p.name]));
        summary = `Operators on ${keys.map((k) => planName.get(k) ?? (k === 'trial' ? 'Trial' : k)).join(', ')}`;
      } else if (aud.scope === 'operators') {
        const ids = new Set(aud.operatorIds ?? []);
        if (ids.size === 0) throw new AudienceError('Select at least one operator.');
        target = orgs.filter((o) => ids.has(o.id));
        summary = target.length === 1 ? `Operators of ${target[0].name}` : `Operators of ${target.length} fleets`;
      } else if (aud.scope === 'not_set_up') {
        const ids = await fleetsNotSetUp(admin);
        target = orgs.filter((o) => ids.has(o.id));
        summary = 'Admins of fleets with no drivers or vehicles yet';
        if (target.length === 0) throw new AudienceError('Every fleet has added drivers or vehicles — no one to send to.');
      }
      if (target.length === 0) throw new AudienceError('No operators matched that audience.');

      const targetIds = new Set(target.map((o) => o.id));
      // Only an admin can connect integrations and add the fleet, so a
      // "finish setting up" email goes to admins, not staff.
      const roles = aud.scope === 'not_set_up' ? ['admin'] : ['admin', 'staff'];
      const mems = (
        await fetchAll<MemberRow>((a, b) =>
          admin
            .from('memberships')
            .select('user_id, organization_id, role')
            .in('role', roles)
            .order('created_at')
            .order('id')
            .range(a, b),
        )
      ).filter((m) => targetIds.has(m.organization_id));
      const users = await usersByIds([...new Set(mems.map((m) => m.user_id))]);
      const userById = new Map(users.map((u) => [u.id, u]));
      for (const m of mems) {
        const u = userById.get(m.user_id);
        if (u) add(u.email, u.full_name, orgName.get(m.organization_id));
      }
      break;
    }

    case 'drivers': {
      let fleetIds: Set<string> | null = null;
      summary = aud.activeOnly ? 'All active drivers' : 'All drivers';
      if (aud.scope === 'operators') {
        fleetIds = new Set(aud.operatorIds ?? []);
        if (fleetIds.size === 0) throw new AudienceError('Select at least one operator.');
        const names = [...fleetIds].map((id) => orgName.get(id)).filter(Boolean);
        summary = `${aud.activeOnly ? 'Active drivers' : 'Drivers'} of ${names.length === 1 ? names[0] : `${names.length} fleets`}`;
      }
      const drivers = (
        await fetchAll<DriverRow>((a, b) =>
          admin.from('drivers').select('id, user_id, full_name, organization_id, status').order('id').range(a, b),
        )
      ).filter((d) => (!fleetIds || fleetIds.has(d.organization_id)) && (!aud.activeOnly || d.status === 'active'));
      const users = await usersByIds([...new Set(drivers.map((d) => d.user_id).filter((id): id is string => Boolean(id)))]);
      const userById = new Map(users.map((u) => [u.id, u]));
      for (const d of drivers) {
        const u = d.user_id ? userById.get(d.user_id) : undefined;
        if (u) add(u.email, d.full_name || u.full_name, orgName.get(d.organization_id));
      }
      break;
    }

    case 'custom': {
      const emails = [...new Set((aud.emails ?? []).map((e) => e.trim().toLowerCase()).filter(isValidEmail))];
      if (emails.length === 0) throw new AudienceError('Add at least one valid email address.');
      if (emails.length > MAX_CAMPAIGN_RECIPIENTS) {
        throw new AudienceError(`That list has ${emails.length.toLocaleString('en-GB')} addresses — the limit per send is ${MAX_CAMPAIGN_RECIPIENTS.toLocaleString('en-GB')}.`);
      }
      // Personalise for addresses that belong to Rovora users; others get the fallbacks.
      const users = await selectIn<UserRow>(emails, (chunk) =>
        admin.from('users').select('id, email, full_name').in('email', chunk),
      );
      const mems = await selectIn<MemberRow>(
        users.map((u) => u.id),
        (chunk) => admin.from('memberships').select('user_id, organization_id').in('user_id', chunk),
      );
      const fleetOf = new Map<string, string>();
      for (const m of mems) if (!fleetOf.has(m.user_id)) fleetOf.set(m.user_id, orgName.get(m.organization_id) ?? '');
      const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
      for (const e of emails) {
        const u = userByEmail.get(e);
        add(e, u?.full_name, u ? fleetOf.get(u.id) : '');
      }
      summary = emails.length === 1 ? emails[0] : `${emails.length} addresses`;
      break;
    }

    default:
      throw new AudienceError('Unknown audience.');
  }

  return { recipients: [...byEmail.values()], summary };
}

/**
 * Fleets that signed up but never got going: no drivers AND no vehicles.
 * Leaves out fleets that can't open their dashboard (expired trial, suspended
 * or cancelled) — the email's button would only land them on a lock screen —
 * and fleets that told us at sign-up they don't work with Bolt.
 */
async function fleetsNotSetUp(admin: AdminClient): Promise<Set<string>> {
  const [orgs, drivers, vehicles] = await Promise.all([
    fetchAll<{ id: string; plan: string | null; status: string | null; trial_ends_at: string | null }>((a, b) =>
      admin.from('organizations').select('id, plan, status, trial_ends_at').order('id').range(a, b),
    ),
    fetchAll<{ organization_id: string | null }>((a, b) =>
      admin.from('drivers').select('organization_id').order('id').range(a, b),
    ),
    fetchAll<{ organization_id: string | null }>((a, b) =>
      admin.from('vehicles').select('organization_id').order('id').range(a, b),
    ),
  ]);
  const hasFleet = new Set([...drivers, ...vehicles].map((r) => r.organization_id).filter(Boolean));

  // Answered at sign-up since the Bolt import shipped. The column comes with
  // 20261123_bolt_fleet_import.sql; before that, nobody has answered.
  const noBolt = new Set<string>();
  const answers = await admin.from('organizations').select('id, ride_platforms').not('ride_platforms', 'is', null).range(0, 9999);
  if (!answers.error) {
    for (const o of (answers.data ?? []) as { id: string; ride_platforms: string[] | null }[]) {
      if (o.ride_platforms && o.ride_platforms.length > 0 && !o.ride_platforms.includes('bolt')) noBolt.add(o.id);
    }
  }

  const now = Date.now();
  const out = new Set<string>();
  for (const o of orgs) {
    if (hasFleet.has(o.id) || noBolt.has(o.id)) continue;
    if (o.status === 'suspended' || o.status === 'cancelled') continue;
    const onTrial = (o.plan ?? 'trial') === 'trial';
    if (onTrial && (!o.trial_ends_at || new Date(o.trial_ends_at).getTime() < now)) continue;
    out.add(o.id);
  }
  return out;
}

async function loadUnsubscribed(admin: AdminClient): Promise<Set<string>> {
  const rows = await fetchAll<{ email: string }>((a, b) =>
    admin.from('email_unsubscribes').select('email').order('email').range(a, b),
  );
  return new Set(rows.map((r) => r.email));
}

// ─── Content validation & per-recipient rendering ────────────────────────────

export interface CampaignContent {
  subject: string;
  preheader?: string;
  html: string;
  fromName?: string;
  replyTo?: string;
  /** true: newsletter/marketing (respects unsubscribes). false: service notice. */
  marketing: boolean;
  templateId?: string | null;
}

interface CleanContent {
  subject: string;
  preheader: string;
  html: string;
  fromName: string;
  replyTo: string;
  marketing: boolean;
  templateId: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateContent(c: CampaignContent): { error: string } | { clean: CleanContent } {
  const subject = (c.subject ?? '').replace(/[\r\n]+/g, ' ').trim();
  const preheader = (c.preheader ?? '').replace(/[\r\n]+/g, ' ').trim();
  const html = (c.html ?? '').trim();
  const fromName = (c.fromName ?? '').trim();
  const replyTo = (c.replyTo ?? '').trim().toLowerCase();

  if (!subject) return { error: 'Add a subject line.' };
  if (subject.length > 200) return { error: 'Keep the subject under 200 characters.' };
  if (preheader.length > 300) return { error: 'Keep the preview text under 300 characters.' };
  if (!html) return { error: 'The email has no content.' };
  if (html.length > 600_000) return { error: 'That HTML is too large (over 600 KB). Host big images instead of embedding them.' };
  if (fromName.length > 60) return { error: 'Keep the sender name under 60 characters.' };
  if (replyTo && !isValidEmail(replyTo)) return { error: 'The reply-to address is not a valid email.' };

  const unknown = findUnknownMergeTags(`${subject}\n${preheader}\n${html}`);
  if (unknown.length) {
    return {
      error: `Unknown merge tag${unknown.length === 1 ? '' : 's'}: ${unknown.map((t) => `{{${t}}}`).join(', ')}. Fix ${unknown.length === 1 ? 'it' : 'them'} or use one of the listed tags.`,
    };
  }

  const templateId = c.templateId && UUID_RE.test(c.templateId) ? c.templateId : null;
  return { clean: { subject, preheader, html, fromName, replyTo, marketing: Boolean(c.marketing), templateId } };
}

/** Builds the per-recipient emails. Throws only if the unsubscribe key is missing. */
function buildMessages(c: CleanContent, recipients: Recipient[], subjectPrefix = ''): BatchEmail[] {
  const prepared = prepareCampaignHtml(c.html, { preheader: c.preheader, marketing: c.marketing });
  const from = fromWithName(c.fromName);
  const base = { app_url: appUrl(), logo_url: assetUrl('/logo-full.png'), app_name: appName(), year: String(new Date().getFullYear()) };

  return recipients.map((r) => {
    const links = unsubscribeLinks(r.email);
    const vars: MergeVars = {
      ...base,
      first_name: r.fullName.split(/\s+/)[0] ?? '',
      full_name: r.fullName,
      email: r.email,
      fleet_name: r.fleetName,
      unsubscribe_url: links.page,
    };
    vars.preheader = renderMergeTags(c.preheader, vars, 'text');
    const html = renderMergeTags(prepared, vars, 'html');
    return {
      to: r.email,
      from,
      subject: subjectPrefix + renderMergeTags(c.subject, vars, 'text'),
      html,
      text: htmlToText(html),
      ...(c.replyTo ? { replyTo: c.replyTo } : {}),
      ...(c.marketing ? { headers: unsubscribeHeaders(r.email) } : {}),
    };
  });
}

// ─── Setup (what the tab needs on load) ──────────────────────────────────────

export interface CampaignOperator {
  id: string;
  name: string;
  plan: string;
  driverCount: number;
  managerCount: number;
}

export interface CampaignSetup {
  /** RESEND_API_KEY present. */
  configured: boolean;
  /** The migration hasn't been run yet. */
  setupMissing: boolean;
  fromAddress: string;
  defaultFromName: string;
  adminEmail: string;
  /** Sample values for the live preview: the admin's own name and fleet. */
  preview: { firstName: string; fullName: string; fleetName: string; appUrl: string; logoUrl: string; appName: string };
  operators: CampaignOperator[];
  plans: { key: string; name: string }[];
  totals: { users: number; drivers: number; activeDrivers: number };
  unsubscribedCount: number;
}

export async function getEmailCampaignSetupAction(): Promise<CampaignSetup> {
  const adminUser = await requirePlatformAdmin();
  const admin = createAdminClient();

  const [orgs, drivers, managers, { data: plans }, { count: userCount }, unsub, { data: me }, { data: myMem }] = await Promise.all([
    fetchAll<OrgRow>((a, b) => admin.from('organizations').select('id, name, plan').order('name').order('id').range(a, b)),
    fetchAll<{ organization_id: string; status: string | null }>((a, b) =>
      admin.from('drivers').select('id, organization_id, status').order('id').range(a, b),
    ),
    fetchAll<{ organization_id: string }>((a, b) =>
      admin.from('memberships').select('id, organization_id').in('role', ['admin', 'staff']).order('id').range(a, b),
    ),
    admin.from('plans').select('key, name').order('sort_order'),
    admin.from('users').select('id', { count: 'exact', head: true }),
    admin.from('email_unsubscribes').select('email', { count: 'exact', head: true }),
    admin.from('users').select('full_name').eq('id', adminUser.id).maybeSingle(),
    admin.from('memberships').select('organization_id').eq('user_id', adminUser.id).order('created_at').limit(1),
  ]);

  const driverCount = new Map<string, number>();
  let activeDrivers = 0;
  for (const d of drivers) {
    driverCount.set(d.organization_id, (driverCount.get(d.organization_id) ?? 0) + 1);
    if (d.status === 'active') activeDrivers++;
  }
  const managerCount = new Map<string, number>();
  for (const m of managers) managerCount.set(m.organization_id, (managerCount.get(m.organization_id) ?? 0) + 1);

  const fullName = ((me as { full_name: string | null } | null)?.full_name ?? '').trim();
  const myOrgId = ((myMem ?? []) as { organization_id: string }[])[0]?.organization_id;
  const myFleet = orgs.find((o) => o.id === myOrgId)?.name ?? 'Harbour Cabs';

  const planList = ((plans ?? []) as { key: string; name: string }[]).filter((p) => p.key !== 'trial');

  return {
    configured: isEmailConfigured(),
    setupMissing: isMissingTable(unsub.error),
    fromAddress: emailFromAddress(),
    defaultFromName: emailFromName(),
    adminEmail: adminUser.email,
    preview: {
      firstName: fullName.split(/\s+/)[0] || 'Alex',
      fullName: fullName || 'Alex Borg',
      fleetName: myFleet,
      appUrl: appUrl(),
      logoUrl: assetUrl('/logo-full.png'),
      appName: appName(),
    },
    operators: orgs.map((o) => ({
      id: o.id,
      name: o.name,
      plan: o.plan ?? 'trial',
      driverCount: driverCount.get(o.id) ?? 0,
      managerCount: managerCount.get(o.id) ?? 0,
    })),
    plans: [{ key: 'trial', name: 'Trial' }, ...planList],
    totals: { users: userCount ?? 0, drivers: drivers.length, activeDrivers },
    unsubscribedCount: unsub.count ?? 0,
  };
}

// ─── Audience preview ────────────────────────────────────────────────────────

export interface AudiencePreview {
  /** Addresses that would receive the email. */
  total: number;
  /** Left out because they unsubscribed (marketing sends only). */
  excluded: number;
  sample: string[];
  summary: string;
  error?: string;
}

export async function previewEmailAudienceAction(audience: CampaignAudience, marketing: boolean): Promise<AudiencePreview> {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  try {
    const { recipients, summary } = await resolveRecipients(admin, audience);
    let list = recipients;
    if (marketing) {
      const unsub = await loadUnsubscribed(admin).catch((e) => {
        if (isMissingTable(e)) return new Set<string>();
        throw e;
      });
      list = recipients.filter((r) => !unsub.has(r.email));
    }
    return {
      total: list.length,
      excluded: recipients.length - list.length,
      sample: list.slice(0, 6).map((r) => r.email),
      summary,
    };
  } catch (e) {
    if (e instanceof AudienceError) return { total: 0, excluded: 0, sample: [], summary: '', error: e.message };
    console.error('[campaigns] audience preview failed:', e);
    return { total: 0, excluded: 0, sample: [], summary: '', error: 'Could not load that audience.' };
  }
}

// ─── Test send ───────────────────────────────────────────────────────────────

export async function sendEmailCampaignTestAction(
  input: CampaignContent & { to?: string },
): Promise<{ ok?: true; to?: string; error?: string }> {
  const adminUser = await requirePlatformAdmin();
  const v = validateContent(input);
  if ('error' in v) return { error: v.error };
  if (!isEmailConfigured()) return { error: 'Email is not configured — set RESEND_API_KEY on the server.' };

  const to = (input.to?.trim() || adminUser.email).toLowerCase();
  if (!isValidEmail(to)) return { error: 'That test address is not a valid email.' };

  const admin = createAdminClient();
  const { data: u } = await admin.from('users').select('id, full_name').eq('email', to).maybeSingle();
  const user = u as { id: string; full_name: string | null } | null;
  let fleetName = '';
  if (user) {
    const { data: mem } = await admin
      .from('memberships')
      .select('organization_id, organizations(name)')
      .eq('user_id', user.id)
      .order('created_at')
      .limit(1);
    const org = ((mem ?? []) as { organizations: { name: string } | { name: string }[] | null }[])[0]?.organizations;
    fleetName = (Array.isArray(org) ? org[0]?.name : org?.name) ?? '';
  }

  let messages: BatchEmail[];
  try {
    messages = buildMessages(v.clean, [{ email: to, fullName: user?.full_name ?? '', fleetName }], '[Test] ');
  } catch (e) {
    console.error('[campaigns] building test email failed:', e);
    return { error: 'Could not build the email (unsubscribe signing key missing).' };
  }

  const res = await sendEmailBatch(messages);
  if (res.sent === 0) return { error: res.errors[0] ?? 'Resend rejected the test email.' };
  return { ok: true, to };
}

// ─── The real send ───────────────────────────────────────────────────────────

export interface CampaignSendResult {
  ok?: true;
  campaignId?: string;
  sent?: number;
  failed?: number;
  skipped?: number;
  errors?: string[];
  error?: string;
}

export async function sendEmailCampaignAction(
  input: CampaignContent & { audience: CampaignAudience },
): Promise<CampaignSendResult> {
  const adminUser = await requirePlatformAdmin();
  const v = validateContent(input);
  if ('error' in v) return { error: v.error };
  const c = v.clean;
  if (!isEmailConfigured()) return { error: 'Email is not configured — set RESEND_API_KEY on the server.' };

  const admin = createAdminClient();

  let resolved: { recipients: Recipient[]; summary: string };
  try {
    resolved = await resolveRecipients(admin, input.audience);
  } catch (e) {
    if (e instanceof AudienceError) return { error: e.message };
    console.error('[campaigns] resolving audience failed:', e);
    return { error: 'Could not load that audience.' };
  }

  let list = resolved.recipients;
  if (c.marketing) {
    try {
      const unsub = await loadUnsubscribed(admin);
      list = list.filter((r) => !unsub.has(r.email));
    } catch (e) {
      if (isMissingTable(e)) return { error: SETUP_MISSING };
      console.error('[campaigns] loading unsubscribes failed:', e);
      return { error: 'Could not check the unsubscribe list, so nothing was sent.' };
    }
  }
  const skipped = resolved.recipients.length - list.length;

  if (list.length === 0) {
    return { error: skipped ? 'Everyone in that audience has unsubscribed from marketing email.' : 'No one matched that audience.' };
  }
  if (list.length > MAX_CAMPAIGN_RECIPIENTS) {
    return {
      error: `That's ${list.length.toLocaleString('en-GB')} recipients — the limit per send is ${MAX_CAMPAIGN_RECIPIENTS.toLocaleString('en-GB')}. Narrow the audience.`,
    };
  }

  let messages: BatchEmail[];
  try {
    messages = buildMessages(c, list);
  } catch (e) {
    console.error('[campaigns] building emails failed:', e);
    return { error: 'Could not build the emails (unsubscribe signing key missing).' };
  }

  const { data: row, error: insertError } = await admin
    .from('email_campaigns')
    .insert({
      template_id: c.templateId,
      subject: c.subject,
      preheader: c.preheader || null,
      from_name: c.fromName || null,
      reply_to: c.replyTo || null,
      html: c.html,
      marketing: c.marketing,
      audience: input.audience,
      target_summary: resolved.summary,
      status: 'sending',
      recipient_count: list.length,
      skipped_count: skipped,
      sent_by: adminUser.id,
    })
    .select('id')
    .single();

  if (insertError || !row) {
    if (isMissingTable(insertError)) return { error: SETUP_MISSING };
    console.error('[campaigns] creating campaign row failed:', insertError);
    return { error: 'Could not create the campaign record, so nothing was sent.' };
  }
  const campaignId = (row as { id: string }).id;

  const tags = [
    { name: 'category', value: c.marketing ? 'campaign' : 'service_notice' },
    { name: 'campaign_id', value: campaignId },
  ];
  const res = await sendEmailBatch(
    messages.map((m) => ({ ...m, tags })),
    { idempotencyKey: `campaign-${campaignId}` },
  );

  const status = res.sent === 0 ? 'failed' : res.failed > 0 ? 'partial' : 'sent';
  const { error: updateError } = await admin
    .from('email_campaigns')
    .update({
      status,
      sent_count: res.sent,
      failed_count: res.failed,
      errors: res.errors.length ? res.errors : null,
      finished_at: new Date().toISOString(),
    })
    .eq('id', campaignId);
  if (updateError) console.error('[campaigns] recording campaign result failed:', updateError);

  if (res.sent === 0) return { error: res.errors[0] ?? 'Resend rejected every email.', campaignId };
  return { ok: true, campaignId, sent: res.sent, failed: res.failed, skipped, errors: res.errors.slice(0, 3) };
}

// ─── Saved templates ─────────────────────────────────────────────────────────

export interface SavedTemplate {
  id: string;
  name: string;
  subject: string;
  preheader: string;
  html: string;
  created_at: string;
  updated_at: string;
}

const TEMPLATE_COLS = 'id, name, subject, preheader, html, created_at, updated_at';

export async function listEmailTemplatesAction(): Promise<{ templates: SavedTemplate[]; setupMissing?: boolean }> {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin.from('email_templates').select(TEMPLATE_COLS).order('updated_at', { ascending: false });
  if (error) {
    if (!isMissingTable(error)) console.error('[campaigns] listing templates failed:', error);
    return { templates: [], setupMissing: isMissingTable(error) };
  }
  return { templates: (data ?? []) as SavedTemplate[] };
}

export async function saveEmailTemplateAction(input: {
  id?: string | null;
  name: string;
  subject: string;
  preheader: string;
  html: string;
}): Promise<{ template?: SavedTemplate; error?: string }> {
  const adminUser = await requirePlatformAdmin();
  const name = (input.name ?? '').trim();
  const html = (input.html ?? '').trim();
  if (!name) return { error: 'Give the template a name.' };
  if (name.length > 120) return { error: 'Keep the template name under 120 characters.' };
  if (!html) return { error: 'The template has no HTML.' };
  if (html.length > 600_000) return { error: 'That HTML is too large (over 600 KB).' };

  const values = {
    name,
    subject: (input.subject ?? '').trim().slice(0, 200),
    preheader: (input.preheader ?? '').trim().slice(0, 300),
    html,
    updated_at: new Date().toISOString(),
  };

  const admin = createAdminClient();
  const query =
    input.id && UUID_RE.test(input.id)
      ? admin.from('email_templates').update(values).eq('id', input.id).select(TEMPLATE_COLS).single()
      : admin.from('email_templates').insert({ ...values, created_by: adminUser.id }).select(TEMPLATE_COLS).single();
  const { data, error } = await query;
  if (error || !data) {
    if (isMissingTable(error)) return { error: SETUP_MISSING };
    console.error('[campaigns] saving template failed:', error);
    return { error: 'Could not save the template.' };
  }
  return { template: data as SavedTemplate };
}

export async function deleteEmailTemplateAction(id: string): Promise<{ ok?: true; error?: string }> {
  await requirePlatformAdmin();
  if (!UUID_RE.test(id)) return { error: 'Unknown template.' };
  const admin = createAdminClient();
  const { error } = await admin.from('email_templates').delete().eq('id', id);
  if (error) {
    console.error('[campaigns] deleting template failed:', error);
    return { error: 'Could not delete the template.' };
  }
  return { ok: true };
}

// ─── Sent campaigns ──────────────────────────────────────────────────────────

export interface CampaignSummary {
  id: string;
  subject: string;
  target_summary: string | null;
  status: 'sending' | 'sent' | 'partial' | 'failed';
  marketing: boolean;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  skipped_count: number;
  created_at: string;
  finished_at: string | null;
}

export interface CampaignDetail extends CampaignSummary {
  preheader: string | null;
  from_name: string | null;
  reply_to: string | null;
  html: string;
  audience: CampaignAudience;
  errors: string[] | null;
}

export async function listEmailCampaignsAction(): Promise<{ campaigns: CampaignSummary[]; setupMissing?: boolean }> {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('email_campaigns')
    .select('id, subject, target_summary, status, marketing, recipient_count, sent_count, failed_count, skipped_count, created_at, finished_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    if (!isMissingTable(error)) console.error('[campaigns] listing campaigns failed:', error);
    return { campaigns: [], setupMissing: isMissingTable(error) };
  }
  return { campaigns: (data ?? []) as CampaignSummary[] };
}

export async function getEmailCampaignAction(id: string): Promise<{ campaign?: CampaignDetail; error?: string }> {
  await requirePlatformAdmin();
  if (!UUID_RE.test(id)) return { error: 'Unknown campaign.' };
  const admin = createAdminClient();
  const { data, error } = await admin.from('email_campaigns').select('*').eq('id', id).maybeSingle();
  if (error || !data) return { error: 'Could not load that campaign.' };
  return { campaign: data as CampaignDetail };
}
