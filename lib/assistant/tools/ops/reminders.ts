// reminders — the fleet's to-do reminders: open, overdue, due soon, assigned to me.
// Mirrors app/api/reminders/route.ts: the per-fleet `reminders` view permission
// gates staff, admins see every reminder, staff only the ones they created or
// are assigned to. "Overdue" is RemindersManager's rule: a due date in the past
// on a reminder that is not completed or cancelled.

import type { AssistantContext, AssistantTool } from '../../types';
import { argBool, argEnum, argInt, capList } from '../args';
import { daysBetween, localDay } from '../../period';
import { getResourcePermissionsForUser } from '@/lib/permissions';

export const REMINDERS_NOT_ALLOWED = 'Your role cannot view reminders.';
const ACTIVE = ['pending', 'in_progress'] as const;
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/**
 * Same check as GET /api/reminders. The context only carries the assistant
 * role; a driver with also_staff is 'staff' here, which resolves to the same
 * 'staff' permission row lib/permissions.ts would pick for them.
 */
export async function canViewReminders(ctx: AssistantContext): Promise<boolean> {
  if (ctx.isAdmin) return true;
  const perms = await getResourcePermissionsForUser(
    { id: ctx.userId, role: 'staff', also_staff: false, organization_id: ctx.orgId },
    'reminders',
  );
  return perms.can_view;
}

interface ReminderRow {
  id: string;
  title: string | null;
  priority: string;
  status: string;
  due_date: string | null;
  assigned_to: string | null;
  created_by: string;
  recurring: string | null;
  completed_at: string | null;
  assignee: { full_name: string | null } | { full_name: string | null }[] | null;
}

/** Active (pending / in progress) reminders this person may see. Columns per migrations/20260407_reminders.sql. */
export async function loadActiveReminders(ctx: AssistantContext): Promise<ReminderRow[]> {
  let query = ctx.db
    .from('reminders')
    .select('id, title, priority, status, due_date, assigned_to, created_by, recurring, completed_at, assignee:assigned_to (full_name)')
    .eq('organization_id', ctx.orgId)
    .in('status', [...ACTIVE])
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(1000);
  // ctx.userId is the session's own user id (a UUID), safe inside the filter.
  if (!ctx.isAdmin) query = query.or(`created_by.eq.${ctx.userId},assigned_to.eq.${ctx.userId}`);
  const { data, error } = await query;
  if (error) throw new Error(`reminders: ${error.message}`);
  return (data ?? []) as ReminderRow[];
}

export function isOverdue(r: Pick<ReminderRow, 'due_date' | 'status'>, now: number): boolean {
  if (!r.due_date || r.status === 'completed' || r.status === 'cancelled') return false;
  return Date.parse(r.due_date) < now;
}

export const remindersTool: AssistantTool = {
  name: 'reminders',
  status: 'Checking reminders…',
  description:
    'The fleet\'s reminders / to-do list: open (pending or in progress), overdue, due soon, or completed, with priority, due date and who it is assigned to. Use for "what reminders are overdue", "what\'s on my to-do list", "anything urgent", "what is assigned to me". Staff only see reminders they created or are assigned to (same as the Reminders page).',
  parameters: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['active', 'overdue', 'due_soon', 'completed', 'cancelled', 'all'],
        description: 'Default active (pending + in progress).',
      },
      priority: { type: 'string', enum: ['any', 'low', 'medium', 'high', 'urgent'], description: 'Default any.' },
      assigned_to_me: { type: 'boolean', description: 'Only reminders assigned to the person asking.' },
      within_days: { type: 'integer', description: 'For status due_soon: due within this many days (default 7).' },
    },
  },
  roles: ['admin', 'staff'],
  module: 'reminders',
  async run(ctx, args) {
    if (!(await canViewReminders(ctx))) return { data: { not_allowed: REMINDERS_NOT_ALLOWED } };

    const status = argEnum(args, 'status', ['active', 'overdue', 'due_soon', 'completed', 'cancelled', 'all'] as const, 'active');
    const priority = argEnum(args, 'priority', ['any', 'low', 'medium', 'high', 'urgent'] as const, 'any');
    const mine = argBool(args, 'assigned_to_me');
    const withinDays = argInt(args, 'within_days', 7, 0, 365);
    const now = Date.now();

    const active = await loadActiveReminders(ctx);

    // Finished reminders only when asked for: recurring ones pile up quickly.
    let finished: ReminderRow[] = [];
    if (status === 'completed' || status === 'cancelled' || status === 'all') {
      let query = ctx.db
        .from('reminders')
        .select('id, title, priority, status, due_date, assigned_to, created_by, recurring, completed_at, assignee:assigned_to (full_name)')
        .eq('organization_id', ctx.orgId)
        .in('status', status === 'all' ? ['completed', 'cancelled'] : [status])
        .order('updated_at', { ascending: false })
        .limit(100);
      if (!ctx.isAdmin) query = query.or(`created_by.eq.${ctx.userId},assigned_to.eq.${ctx.userId}`);
      const { data, error } = await query;
      if (error) throw new Error(`reminders: ${error.message}`);
      finished = (data ?? []) as ReminderRow[];
    }

    const daysLeft = (r: ReminderRow) => (r.due_date ? daysBetween(ctx.today, localDay(r.due_date, ctx.timeZone)) : null);
    const dueSoon = (r: ReminderRow) => {
      const d = daysLeft(r);
      return !isOverdue(r, now) && d != null && d <= withinDays;
    };

    let rows = status === 'completed' || status === 'cancelled' ? finished : status === 'all' ? [...active, ...finished] : active;
    if (status === 'overdue') rows = rows.filter((r) => isOverdue(r, now));
    if (status === 'due_soon') rows = rows.filter(dueSoon);
    if (priority !== 'any') rows = rows.filter((r) => r.priority === priority);
    if (mine) rows = rows.filter((r) => r.assigned_to === ctx.userId);

    // Overdue first, then by due date (undated last), then by priority.
    rows.sort((a, b) => {
      const o = Number(isOverdue(b, now)) - Number(isOverdue(a, now));
      if (o) return o;
      const da = a.due_date ? Date.parse(a.due_date) : Number.MAX_SAFE_INTEGER;
      const db = b.due_date ? Date.parse(b.due_date) : Number.MAX_SAFE_INTEGER;
      return da - db || (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
    });
    const list = capList(rows, 30);

    return {
      data: {
        today: ctx.today,
        showing: status,
        counts: {
          active: active.length,
          overdue: active.filter((r) => isOverdue(r, now)).length,
          due_within_7_days: active.filter((r) => {
            const d = daysLeft(r);
            return !isOverdue(r, now) && d != null && d <= 7;
          }).length,
          assigned_to_me: active.filter((r) => r.assigned_to === ctx.userId).length,
        },
        scope: ctx.isAdmin ? 'all reminders in the fleet' : 'reminders you created or are assigned to',
        reminders: list.items.map((r) => {
          const assignee = (Array.isArray(r.assignee) ? r.assignee[0] : r.assignee)?.full_name ?? null;
          const left = daysLeft(r);
          const overdue = isOverdue(r, now);
          return {
            title: (r.title ?? '').replace(/\s+/g, ' ').slice(0, 100),
            priority: r.priority,
            status: r.status,
            due: r.due_date ? localDay(r.due_date, ctx.timeZone) : null,
            ...(overdue ? { overdue: true, days_overdue: left != null ? Math.max(0, -left) : undefined } : left != null && r.status !== 'completed' && r.status !== 'cancelled' ? { days_left: left } : {}),
            assigned_to: r.assigned_to === ctx.userId ? 'you' : assignee,
            recurring: r.recurring ?? undefined,
            completed: r.completed_at ? localDay(r.completed_at, ctx.timeZone) : undefined,
          };
        }),
        truncated: list.truncated,
      },
      sources: [{ label: 'Reminders', href: '/fleet/reminders' }],
    };
  },
};
