import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendPushNotification } from '@/lib/notifications/push';
import { sendEmailNotification } from '@/lib/notifications/email';

/**
 * POST /api/notifications/send
 * Send a custom notification to selected recipients
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const {
    title,
    message,
    action_url, // optional URL to navigate to when notification is clicked
    channels, // ['app', 'push', 'email']
    recipients, // 'all_drivers', 'all_admins', 'specific', 'all'
    specific_ids, // array of driver or user IDs if recipients === 'specific'
  } = body;

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
        .eq('status', 'active');
      targetDrivers = drivers || [];
    }

    if (recipients === 'all_admins' || recipients === 'all') {
      const { data: admins } = await supabase
        .from('users')
        .select('id, email, full_name')
        .in('role', ['admin', 'staff']);
      targetUsers = admins || [];
    }

    if (recipients === 'specific' && specific_ids) {
      // Check if these are driver IDs or user IDs
      const { data: drivers } = await supabase
        .from('drivers')
        .select('id, full_name, user_id')
        .in('id', specific_ids);
      
      if (drivers && drivers.length > 0) {
        targetDrivers = drivers;
      } else {
        const { data: users } = await supabase
          .from('users')
          .select('id, email, full_name')
          .in('id', specific_ids);
        targetUsers = users || [];
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
        const appNotifications = targetDrivers.map(driver => ({
          driver_id: driver.id,
          title,
          body: message,
          type: 'info',
          action_url: action_url || null,
          sent_at: new Date().toISOString(),
        }));

        const { error } = await supabase
          .from('notifications')
          .insert(appNotifications);

        if (!error) {
          results.app.sent += targetDrivers.length;
        } else {
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
    if (targetUsers.length > 0) {
      // Push notifications for users
      if (channels.includes('push')) {
        for (const u of targetUsers) {
          try {
            const sent = await sendPushNotification(u.id, {
              title,
              body: message,
              url: action_url || '/admin/notifications',
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
        for (const u of targetUsers) {
          try {
            const sent = await sendEmailNotification({
              to: u.email,
              subject: title,
              body: message,
              driverName: u.full_name || undefined,
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

    // Log the notification
    await supabase.from('notification_log').insert({
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
