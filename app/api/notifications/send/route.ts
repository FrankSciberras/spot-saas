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
        .eq('status', 'active');
      targetDrivers = drivers || [];
    }

    if (recipients === 'all_admins' || recipients === 'all') {
      const { data: admins, error: adminsError } = await supabase
        .from('users')
        .select('id, email, full_name, role')
        .in('role', ['admin', 'staff']);
      
      console.log('Fetching admins/staff:', { admins, error: adminsError });
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
        const now = new Date().toISOString();
        const appNotifications = targetDrivers.map(driver => ({
          driver_id: driver.id,
          title,
          body: message,
          type: 'info',
          action_url: action_url || null,
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
        // Insert a single broadcast notification for admins (driver_id = null means visible to all admins)
        const { data: insertedNotif, error } = await supabase
          .from('notifications')
          .insert({
            driver_id: null, // null = visible to admins/staff
            title,
            body: message,
            type: 'info',
            action_url: action_url || null,
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
