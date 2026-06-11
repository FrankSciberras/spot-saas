import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import { sendPushNotification } from '@/lib/notifications/push';
import { sendEmailNotification } from '@/lib/notifications/email';
import { orgAdminStaffUsers } from '@/lib/notifications/recipients';

/**
 * POST /api/notifications/send
 * Send a custom notification to selected recipients (fleet admin only).
 *
 * Authorization is by the caller's MEMBERSHIP role in their active org (the
 * post-SaaS source of truth), not the deprecated global users.role — so any
 * fleet admin can send, including multi-org users. The active org id is stamped
 * explicitly onto every inserted notification so it lands in the right fleet.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const orgId = session.organization_id;

  const body = await request.json();
  const {
    title,
    message,
    action_url, // optional URL to navigate to when notification is clicked
    channels, // ['app', 'push', 'email']
    recipients, // 'all_drivers', 'all_admins', 'specific', 'all'
    specific_ids, // array of driver or user IDs if recipients === 'specific'
  } = body;

  console.log('=== NOTIFICATION SEND REQUEST ===');
  console.log('Recipients:', recipients);
  console.log('Channels:', channels);
  console.log('Title:', title);

  if (!title || !message || !channels || channels.length === 0) {
    return NextResponse.json({ 
      error: 'Title, message, and at least one channel are required' 
    }, { status: 400 });
  }

  const results = {
    app: { sent: 0, failed: 0 },
    push: { sent: 0, failed: 0 },
    email: { sent: 0, failed: 0 },
  };

  try {
    // Get recipients based on selection
    let targetDrivers: { id: string; full_name: string; user_id: string }[] = [];
    let targetUsers: { id: string; email: string; full_name: string | null }[] = [];

    if (recipients === 'all_drivers' || recipients === 'all') {
      const { data: drivers } = await supabase
        .from('drivers')
        .select('id, full_name, user_id')
        .eq('organization_id', orgId)
        .eq('status', 'active');
      targetDrivers = drivers || [];
    }

    if (recipients === 'all_admins' || recipients === 'all') {
      // Org-scoped via memberships (service role bypasses RLS, so a global
      // users query would notify every fleet's admins — a cross-tenant leak).
      const admin = createAdminClient();
      const staff = await orgAdminStaffUsers(admin, orgId);
      targetUsers = staff.map((u) => ({ id: u.id, email: u.email ?? '', full_name: u.full_name }));
    }

    if (recipients === 'specific' && specific_ids) {
      // Check if these are driver IDs or user IDs
      const { data: drivers } = await supabase
        .from('drivers')
        .select('id, full_name, user_id')
        .eq('organization_id', orgId)
        .in('id', specific_ids);

      if (drivers && drivers.length > 0) {
        targetDrivers = drivers;
      } else {
        // Only target users who are members of THIS fleet.
        const admin = createAdminClient();
        const { data: mems } = await admin
          .from('memberships')
          .select('user_id')
          .eq('organization_id', orgId)
          .in('user_id', specific_ids);
        const allowedIds = Array.from(new Set((mems ?? []).map((m: { user_id: string }) => m.user_id)));
        if (allowedIds.length > 0) {
          const { data: users } = await admin
            .from('users')
            .select('id, email, full_name')
            .in('id', allowedIds);
          targetUsers = ((users || []) as { id: string; email: string | null; full_name: string | null }[])
            .map((u) => ({ id: u.id, email: u.email ?? '', full_name: u.full_name }));
        }
      }
    }

    // Get user emails for drivers
    if (targetDrivers.length > 0) {
      const userIds = targetDrivers.map(d => d.user_id).filter(Boolean);
      const { data: driverUsers } = await supabase
        .from('users')
        .select('id, email')
        .in('id', userIds);

      const userEmailMap = new Map(driverUsers?.map(u => [u.id, u.email]) || []);

      // Send app notifications to drivers
      if (channels.includes('app')) {
        const now = new Date().toISOString();
        const appNotifications = targetDrivers.map(driver => ({
          organization_id: orgId,
          driver_id: driver.id,
          title,
          body: message,
          type: 'info',
          action_url: action_url || null,
          target_role: 'driver',
          sent_at: now,
          created_at: now,
        }));

        const { error } = await supabase
          .from('notifications')
          .insert(appNotifications);

        if (!error) {
          results.app.sent += targetDrivers.length;
        } else {
          console.error('Failed to insert notifications:', error);
          results.app.failed += targetDrivers.length;
        }
      }

      // Send push notifications to drivers
      if (channels.includes('push')) {
        for (const driver of targetDrivers) {
          if (driver.user_id) {
            try {
              const sent = await sendPushNotification(driver.user_id, {
                title,
                body: message,
                url: action_url || '/driver/notifications',
              });
              if (sent) results.push.sent++;
              else results.push.failed++;
            } catch {
              results.push.failed++;
            }
          }
        }
      }

      // Send email notifications to drivers
      if (channels.includes('email')) {
        for (const driver of targetDrivers) {
          const email = userEmailMap.get(driver.user_id);
          if (email) {
            try {
              const sent = await sendEmailNotification({
                to: email,
                subject: title,
                body: message,
                driverName: driver.full_name,
                actionUrl: action_url || undefined,
              });
              if (sent) results.email.sent++;
              else results.email.failed++;
            } catch {
              results.email.failed++;
            }
          }
        }
      }
    }

    // Send to admin/staff users
    console.log(`Processing ${targetUsers.length} admin/staff users for notification`);
    if (targetUsers.length > 0) {
      // App notifications for admin/staff (broadcast with driver_id = null)
      if (channels.includes('app')) {
        const now = new Date().toISOString();
        console.log('Inserting admin app notification with driver_id = null');
        // Insert a single broadcast notification for admins (driver_id = null + target_role = 'admin')
        const { data: insertedNotif, error } = await supabase
          .from('notifications')
          .insert({
            organization_id: orgId,
            driver_id: null,
            title,
            body: message,
            type: 'info',
            action_url: action_url || null,
            target_role: recipients === 'all' ? 'all' : 'admin', // 'admin' for admin-only, 'all' for everyone
            sent_at: now,
            created_at: now,
          })
          .select()
          .single();

        if (!error) {
          console.log('Admin notification inserted successfully:', insertedNotif?.id);
          results.app.sent += targetUsers.length;
        } else {
          console.error('Failed to insert admin notification:', error);
          results.app.failed += targetUsers.length;
        }
      }

      // Push notifications for users
      if (channels.includes('push')) {
        for (const u of targetUsers) {
          try {
            const sent = await sendPushNotification(u.id, {
              title,
              body: message,
              url: action_url || '/fleet/notifications',
            });
            if (sent) results.push.sent++;
            else results.push.failed++;
          } catch {
            results.push.failed++;
          }
        }
      }

      // Email notifications for users
      if (channels.includes('email')) {
        console.log(`Sending emails to ${targetUsers.length} admin/staff users`);
        for (const u of targetUsers) {
          console.log(`Attempting email to: ${u.email}`);
          try {
            const sent = await sendEmailNotification({
              to: u.email,
              subject: title,
              body: message,
              driverName: u.full_name || undefined,
              actionUrl: action_url || undefined,
            });
            if (sent) {
              console.log(`Email sent successfully to ${u.email}`);
              results.email.sent++;
            } else {
              console.log(`Email failed for ${u.email}`);
              results.email.failed++;
            }
          } catch (err) {
            console.error(`Email error for ${u.email}:`, err);
            results.email.failed++;
          }
        }
      }
    }

    // Log the notification
    await supabase.from('notification_log').insert({
      organization_id: orgId,
      channel: channels.length === 1 ? channels[0] : 'all',
      title,
      body: message,
      status: 'sent',
      metadata: {
        recipients,
        specific_ids,
        results,
      },
      sent_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: 'Notifications sent',
      results,
    });
  } catch (error) {
    console.error('Send notification error:', error);
    return NextResponse.json({ error: 'Failed to send notifications' }, { status: 500 });
  }
}
