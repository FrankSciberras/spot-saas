import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * GET /api/cron/reminders
 * 1. Fire notifications for reminders where remind_at <= now and not yet sent
 * 2. Regenerate recurring reminders that were completed
 */
export async function GET() {
  try {
    const supabase = createAdminClient();
    const now = new Date().toISOString();
    let notificationsFired = 0;
    let recurringCreated = 0;

    // ── 1. Fire timed reminder notifications ──
    const { data: dueReminders } = await supabase
      .from('reminders')
      .select('id, organization_id, title, description, created_by, assigned_to, due_date, priority')
      .lte('remind_at', now)
      .eq('reminder_sent', false)
      .in('status', ['pending', 'in_progress']);

    if (dueReminders && dueReminders.length > 0) {
      for (const r of dueReminders) {
        const priorityLabel = r.priority === 'urgent' ? '🔴 URGENT' : r.priority === 'high' ? '🟠 High' : '';
        const titlePrefix = priorityLabel ? `${priorityLabel}: ` : '';

        await supabase.from('notifications').insert({
          organization_id: r.organization_id,
          title: `${titlePrefix}Reminder: ${r.title}`,
          body: r.description || `You have a reminder due${r.due_date ? ' on ' + new Date(r.due_date).toLocaleDateString('en-GB') : ''}.`,
          type: 'reminder',
          driver_id: null,
          target_role: 'admin',
          action_url: '/fleet/reminders',
          sent_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        });

        await supabase
          .from('reminders')
          .update({ reminder_sent: true })
          .eq('id', r.id);

        notificationsFired++;
      }
    }

    // ── 2. Regenerate recurring reminders ──
    const { data: completedRecurring } = await supabase
      .from('reminders')
      .select('*')
      .eq('status', 'completed')
      .not('recurring', 'is', null);

    if (completedRecurring && completedRecurring.length > 0) {
      for (const r of completedRecurring) {
        // Calculate next due date
        const baseDue = r.due_date ? new Date(r.due_date) : new Date();
        const nextDue = new Date(baseDue);

        switch (r.recurring) {
          case 'daily': nextDue.setDate(nextDue.getDate() + 1); break;
          case 'weekly': nextDue.setDate(nextDue.getDate() + 7); break;
          case 'monthly': nextDue.setMonth(nextDue.getMonth() + 1); break;
          case 'yearly': nextDue.setFullYear(nextDue.getFullYear() + 1); break;
        }

        // Check if past end date
        if (r.recurring_end_date && nextDue > new Date(r.recurring_end_date)) {
          // Clear recurring on the completed one so it doesn't get picked up again
          await supabase.from('reminders').update({ recurring: null }).eq('id', r.id);
          continue;
        }

        // Calculate remind_at offset (same offset from due_date as original)
        let nextRemindAt: string | null = null;
        if (r.remind_at && r.due_date) {
          const offset = new Date(r.due_date).getTime() - new Date(r.remind_at).getTime();
          nextRemindAt = new Date(nextDue.getTime() - offset).toISOString();
        } else if (r.remind_at) {
          // Same time next period
          nextRemindAt = nextDue.toISOString();
        }

        // Check if a child for this next due date already exists
        const { data: existing } = await supabase
          .from('reminders')
          .select('id')
          .eq('parent_id', r.parent_id || r.id)
          .eq('due_date', nextDue.toISOString())
          .limit(1);

        if (existing && existing.length > 0) {
          // Already created, clear recurring on old one
          await supabase.from('reminders').update({ recurring: null }).eq('id', r.id);
          continue;
        }

        // Create next occurrence
        await supabase.from('reminders').insert({
          organization_id: r.organization_id,
          created_by: r.created_by,
          assigned_to: r.assigned_to,
          title: r.title,
          description: r.description,
          priority: r.priority,
          status: 'pending',
          due_date: nextDue.toISOString(),
          remind_at: nextRemindAt,
          reminder_sent: false,
          recurring: r.recurring,
          recurring_end_date: r.recurring_end_date,
          parent_id: r.parent_id || r.id,
        });

        // Clear recurring on the completed one so it doesn't regenerate again
        await supabase.from('reminders').update({ recurring: null }).eq('id', r.id);

        recurringCreated++;
      }
    }

    return NextResponse.json({
      success: true,
      notifications_fired: notificationsFired,
      recurring_created: recurringCreated,
      timestamp: now,
    });
  } catch (err) {
    console.error('[cron/reminders] Error:', err);
    return NextResponse.json({ error: 'Cron failed' }, { status: 500 });
  }
}
