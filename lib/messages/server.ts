import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSession, isAdminOrStaff } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/server';
import { getEnabledModuleKeys } from '@/lib/modules/server';
import type { ChatConversation, ChatPerson, FleetRole } from './types';

/**
 * Messaging — server-side rules shared by every /api/messages route.
 *
 * All writes go through the service-role client (the tables grant browsers
 * SELECT only), so THIS file is where access is decided:
 *   * you only touch chats in your ACTIVE fleet that you are a member of
 *   * only managers (admin / staff / driver flagged also-staff) create groups
 *   * drivers can message managers; driver↔driver direct chats only when the
 *     fleet has switched `chat_driver_dms` on
 *   * announcement groups: managers post, everyone else reads
 *   * a direct chat with someone who has left the fleet is read-only
 */

export const MESSAGING_MODULE = 'messaging';

export type Admin = SupabaseClient;

export interface ChatActor {
  userId: string;
  organizationId: string;
  role: FleetRole;
  isManager: boolean;
  isAdmin: boolean;
  name: string;
}

export interface ConversationRow {
  id: string;
  organization_id: string;
  kind: 'direct' | 'group';
  title: string | null;
  announcement: boolean;
  auto_members: string | null;
  direct_key: string | null;
  created_by: string | null;
  created_at: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_id: string | null;
  archived_at: string | null;
}

export interface MemberRow {
  conversation_id: string;
  user_id: string;
  organization_id: string;
  is_admin: boolean;
  muted: boolean;
  last_read_at: string;
  joined_at: string;
}

export const CONVERSATION_COLUMNS =
  'id, organization_id, kind, title, announcement, auto_members, direct_key, created_by, created_at, last_message_at, last_message_preview, last_message_sender_id, archived_at';

/** The chat tables / functions don't exist yet (migration 20261117_messaging not run). */
export function isMissingMigration(error: { code?: string } | null | undefined): boolean {
  return !!error && ['PGRST202', 'PGRST205', '42P01', '42883', '42703', 'PGRST204'].includes(error.code ?? '');
}

export const MIGRATION_HINT = 'Messages needs a database update first (migration 20261117_messaging.sql).';

export function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export function noStore<T>(body: T, init?: { status?: number }) {
  return NextResponse.json(body, { status: init?.status ?? 200, headers: { 'Cache-Control': 'private, no-store' } });
}

/**
 * The signed-in user as a chat participant in their active fleet, or an error
 * response (401 signed out, 403 module switched off).
 */
export async function requireChatActor(): Promise<{ actor: ChatActor; admin: Admin } | { response: NextResponse }> {
  const session = await getSession();
  if (!session) return { response: jsonError(401, 'Please sign in again.') };

  const enabled = await getEnabledModuleKeys(session.organization_id);
  if (!enabled.has(MESSAGING_MODULE)) {
    return { response: jsonError(403, 'Messages is switched off for this fleet.', { disabled: true }) };
  }

  return {
    admin: createAdminClient(),
    actor: {
      userId: session.id,
      organizationId: session.organization_id,
      role: session.role as FleetRole,
      isManager: isAdminOrStaff(session),
      isAdmin: session.role === 'admin',
      name: session.full_name?.trim() || session.email.split('@')[0] || 'Someone',
    },
  };
}

/** Sorted pair key for a direct chat — see conversations.direct_key. */
export function directKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

export function otherIdFromKey(key: string | null, me: string): string | null {
  if (!key) return null;
  const [a, b] = key.split(':');
  return a === me ? b : a;
}

/**
 * Names, avatars and fleet roles for a set of users in one fleet. Drivers'
 * names fall back to their driver record (always filled in), then to the
 * first part of their email.
 */
export async function loadPeople(admin: Admin, organizationId: string, userIds: (string | null | undefined)[]): Promise<Map<string, ChatPerson>> {
  const ids = Array.from(new Set(userIds.filter((x): x is string => !!x)));
  const out = new Map<string, ChatPerson>();
  if (!ids.length) return out;

  const [usersRes, membersRes, driversRes] = await Promise.all([
    admin.from('users').select('id, full_name, email, avatar_url').in('id', ids),
    admin.from('memberships').select('user_id, role, also_staff').eq('organization_id', organizationId).in('user_id', ids),
    admin.from('drivers').select('user_id, full_name').eq('organization_id', organizationId).in('user_id', ids),
  ]);

  const users = new Map((usersRes.data ?? []).map((u: { id: string; full_name: string | null; email: string | null; avatar_url: string | null }) => [u.id, u]));
  const members = new Map((membersRes.data ?? []).map((m: { user_id: string; role: string; also_staff: boolean | null }) => [m.user_id, m]));
  const drivers = new Map((driversRes.data ?? []).map((d: { user_id: string; full_name: string | null }) => [d.user_id, d]));

  for (const id of ids) {
    const u = users.get(id);
    const m = members.get(id);
    const d = drivers.get(id);
    const role = (m?.role ?? null) as FleetRole | null;
    const name =
      u?.full_name?.trim() ||
      d?.full_name?.trim() ||
      (u?.email ? u.email.split('@')[0] : '') ||
      'Former member';
    out.set(id, {
      userId: id,
      name,
      avatarUrl: u?.avatar_url ?? null,
      role,
      isManager: role === 'admin' || role === 'staff' || (role === 'driver' && !!m?.also_staff),
      inFleet: !!m,
    });
  }
  return out;
}

export async function driverDmsAllowed(admin: Admin, organizationId: string): Promise<boolean> {
  const { data } = await admin.from('organizations').select('chat_driver_dms').eq('id', organizationId).maybeSingle();
  return !!(data as { chat_driver_dms?: boolean } | null)?.chat_driver_dms;
}

/** Everyone the actor may start a direct chat with, sorted by name. */
export async function listContacts(admin: Admin, actor: ChatActor): Promise<ChatPerson[]> {
  const [{ data: memberships }, driverDms] = await Promise.all([
    admin.from('memberships').select('user_id').eq('organization_id', actor.organizationId),
    actor.isManager ? Promise.resolve(true) : driverDmsAllowed(admin, actor.organizationId),
  ]);
  const ids = (memberships ?? []).map((m: { user_id: string }) => m.user_id).filter((id: string) => id !== actor.userId);
  const people = await loadPeople(admin, actor.organizationId, ids);
  return Array.from(people.values())
    .filter((p) => actor.isManager || p.isManager || (driverDms && p.role === 'driver'))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function canDirectMessage(admin: Admin, actor: ChatActor, targetUserId: string): Promise<boolean> {
  if (targetUserId === actor.userId) return false;
  const people = await loadPeople(admin, actor.organizationId, [targetUserId]);
  const target = people.get(targetUserId);
  if (!target?.inFleet) return false;
  if (actor.isManager || target.isManager) return true;
  return driverDmsAllowed(admin, actor.organizationId);
}

/**
 * A chat in the actor's active fleet that they are a member of, with their
 * membership row — or null (treat as 404: don't reveal that it exists).
 */
export async function loadMembership(
  admin: Admin,
  actor: ChatActor,
  conversationId: string,
): Promise<{ conv: ConversationRow; member: MemberRow } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return null;
  const [convRes, memberRes] = await Promise.all([
    admin
      .from('conversations')
      .select(CONVERSATION_COLUMNS)
      .eq('id', conversationId)
      .eq('organization_id', actor.organizationId)
      .is('archived_at', null)
      .maybeSingle(),
    admin
      .from('conversation_members')
      .select('conversation_id, user_id, organization_id, is_admin, muted, last_read_at, joined_at')
      .eq('conversation_id', conversationId)
      .eq('user_id', actor.userId)
      .maybeSingle(),
  ]);
  if (!convRes.data || !memberRes.data) return null;
  return { conv: convRes.data as ConversationRow, member: memberRes.data as MemberRow };
}

export function canManage(conv: ConversationRow, member: MemberRow, actor: ChatActor): boolean {
  return conv.kind === 'group' && (actor.isManager || member.is_admin);
}

/** Whether the actor can post. `otherInFleet` is only consulted for direct chats. */
export function canPost(conv: ConversationRow, actor: ChatActor, otherInFleet: boolean | null): boolean {
  if (conv.kind === 'group') return !conv.announcement || actor.isManager;
  return otherInFleet !== false;
}

/** Build the UI shape for a single chat (inbox rows come from chat_inbox()). */
export async function describeConversation(
  admin: Admin,
  actor: ChatActor,
  conv: ConversationRow,
  member: MemberRow,
): Promise<ChatConversation> {
  const otherId = conv.kind === 'direct' ? otherIdFromKey(conv.direct_key, actor.userId) : null;
  const [people, countRes, unreadRes] = await Promise.all([
    loadPeople(admin, actor.organizationId, [otherId, conv.last_message_sender_id]),
    admin.from('conversation_members').select('user_id', { count: 'exact', head: true }).eq('conversation_id', conv.id),
    admin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conv.id)
      .gt('created_at', member.last_read_at)
      .neq('kind', 'system')
      .is('deleted_at', null)
      .or(`sender_id.is.null,sender_id.neq.${actor.userId}`),
  ]);
  const other = otherId ? people.get(otherId) ?? null : null;
  const sender = conv.last_message_sender_id ? people.get(conv.last_message_sender_id) : null;
  return {
    id: conv.id,
    kind: conv.kind,
    title: conv.kind === 'direct' ? other?.name ?? 'Direct chat' : conv.title || 'Group',
    announcement: conv.announcement,
    isEveryone: conv.auto_members === 'everyone',
    createdAt: conv.created_at,
    lastMessageAt: conv.last_message_at,
    lastMessagePreview: conv.last_message_preview,
    lastMessageSenderId: conv.last_message_sender_id,
    lastMessageSenderName: sender?.name ?? null,
    muted: member.muted,
    canManage: canManage(conv, member, actor),
    canPost: canPost(conv, actor, other ? other.inFleet : null),
    lastReadAt: member.last_read_at,
    unread: unreadRes.count ?? 0,
    memberCount: countRes.count ?? 0,
    other,
  };
}

/** A grey line in the thread, e.g. "Frank added Ali". */
export async function postSystemMessage(admin: Admin, conv: Pick<ConversationRow, 'id' | 'organization_id'>, body: string) {
  await admin.from('messages').insert({
    conversation_id: conv.id,
    organization_id: conv.organization_id,
    kind: 'system',
    body: body.slice(0, 4000),
  });
}

/** Comma list that stays short: "Ali, Maria and 3 others". */
export function nameList(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
}

/** Fleet members (user ids) from a candidate list — drops anyone not in the fleet. */
export async function filterFleetMembers(admin: Admin, organizationId: string, userIds: string[]): Promise<string[]> {
  const ids = Array.from(new Set(userIds.filter((x) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x))));
  if (!ids.length) return [];
  const { data } = await admin
    .from('memberships')
    .select('user_id')
    .eq('organization_id', organizationId)
    .in('user_id', ids);
  return (data ?? []).map((m: { user_id: string }) => m.user_id);
}
