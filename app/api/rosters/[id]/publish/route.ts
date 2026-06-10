import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createAuditLogEntry, getAuditActor, hasStaffDashboardAccess } from '@/lib/audit/log';
import { sendPushNotification } from '@/lib/notifications/push';
import { sendEmailNotification } from '@/lib/notifications/email';
import { orgAdminStaffUsers } from '@/lib/notifications/recipients';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/rosters/[id]/publish
 * Publish or republish a roster and notify all assigned drivers
 */
export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const supabase = await createClient();
  const adminClient = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const actor = await getAuditActor(user.id);

  if (!hasStaffDashboardAccess(actor)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Parse request body for republish flag
  let republish = false;
  try {
    const body = await request.json();
    republish = body.republish === true;
  } catch {
    // No body or invalid JSON, assume first publish
  }

  // Get roster
  const { data: roster, error: rosterError } = await adminClient
    .from('rosters')
    .select('*')
    .eq('id', id)
    .single();

  if (rosterError || !roster) {
    return NextResponse.json({ error: 'Roster not found' }, { status: 404 });
  }

  const isUpdate = roster.status === 'published' || republish;

  // Update roster status to published
  const { error: updateError } = await adminClient
    .from('rosters')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Get all unique drivers assigned to this roster with their user info
  const { data: assignments } = await adminClient
    .from('roster_assignments')
    .select(`
      driver_id,
      drivers:driver_id (
        id,
        full_name,
        user_id,
        users:user_id (email)
      )
    `)
    .eq('roster_id', id)
    .not('driver_id', 'is', null);

  const notificationResults = {
    app: 0,
    push: 0,
    email: 0,
  };

  if (assignments && assignments.length > 0) {
    // Get unique drivers
    const driversMap = new Map<string, { id: string; full_name: string; email?: string; user_id?: string }>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assignments.forEach((a: any) => {
      const driver = a.drivers;
      if (driver && !driversMap.has(a.driver_id)) {
        driversMap.set(a.driver_id, {
          id: driver.id,
          full_name: driver.full_name,
          user_id: driver.user_id,
          email: driver.users?.email,
        });
      }
    });

    // Fetch the notification rule to get custom action_url
    const triggerType = isUpdate ? 'roster_updated' : 'roster_published';
    const { data: rule } = await adminClient
      .from('notification_rules')
      .select('id, trigger_config, title_template, body_template, channel, target_role')
      .eq('organization_id', roster.organization_id)
      .eq('trigger_type', triggerType)
      .eq('is_active', true)
      .maybeSingle();

    const effectiveChannel = rule?.channel || 'all';
    const effectiveTargetRole = rule?.target_role || 'driver';
    const shouldSendApp = effectiveChannel === 'app' || effectiveChannel === 'all';
    const shouldSendPush = effectiveChannel === 'push' || effectiveChannel === 'all';
    const shouldSendEmail = effectiveChannel === 'email' || effectiveChannel === 'all';

    // Use rule templates if available, otherwise use defaults
    const actionUrl = (rule?.trigger_config as Record<string, string>)?.action_url || '/driver/roster';
    const notificationTitle = rule?.title_template?.replace('{{roster_title}}', roster.title || 'this week') 
      || (isUpdate ? 'Roster Updated' : 'New Roster Published');
    const notificationBody = rule?.body_template?.replace('{{roster_title}}', roster.title || 'this week')
      || (isUpdate 
        ? `The roster for ${roster.title || 'this week'} has been updated. Check your shifts!`
        : `The roster for ${roster.title || 'this week'} is now available. Check your shifts!`);

    const drivers = Array.from(driversMap.values());

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const fullActionUrl = `${appUrl}${actionUrl}`;

    const includeAdmins = effectiveTargetRole === 'admin' || effectiveTargetRole === 'all';
    const includeDrivers = effectiveTargetRole === 'driver' || effectiveTargetRole === 'all';

    // Org-scoped — only THIS fleet's admins/staff (service role bypasses RLS, so
    // a global users query would notify every fleet's admins — a cross-tenant leak).
    let adminUsers: { id: string; email: string | null; full_name: string | null }[] = [];
    if (includeAdmins && (shouldSendEmail || shouldSendPush || shouldSendApp)) {
      adminUsers = await orgAdminStaffUsers(adminClient, roster.organization_id);
    }

    if (shouldSendApp) {
      if (includeDrivers) {
        const appNotifications = drivers.map(driver => ({
          organization_id: roster.organization_id,
          driver_id: driver.id,
          title: notificationTitle,
          body: notificationBody,
          type: 'info',
          action_url: actionUrl,
          target_role: 'driver',
          sent_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        }));

        const { error: notifyError } = await adminClient
          .from('notifications')
          .insert(appNotifications);

        if (!notifyError) {
          notificationResults.app += drivers.length;
        } else {
          console.error('Failed to send app notifications:', notifyError);
        }
      }

      if (includeAdmins) {
        const { error: adminBroadcastError } = await adminClient
          .from('notifications')
          .insert({
            organization_id: roster.organization_id,
            driver_id: null,
            title: notificationTitle,
            body: notificationBody,
            type: 'info',
            action_url: actionUrl,
            target_role: 'admin',
            sent_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          });

        if (!adminBroadcastError) {
          notificationResults.app += adminUsers.length;
        } else {
          console.error('Failed to insert admin roster broadcast notification:', adminBroadcastError);
        }
      }
    }

    if (shouldSendPush) {
      if (includeDrivers) {
        for (const driver of drivers) {
          if (driver.user_id) {
            try {
              await sendPushNotification(driver.user_id, {
                title: notificationTitle,
                body: notificationBody,
                url: actionUrl,
              });
              notificationResults.push++;
            } catch (err) {
              console.error(`Push notification failed for ${driver.full_name}:`, err);
            }
          }
        }
      }

      if (includeAdmins) {
        for (const u of adminUsers) {
          try {
            await sendPushNotification(u.id, {
              title: notificationTitle,
              body: notificationBody,
              url: '/fleet/rosters',
            });
            notificationResults.push++;
          } catch (err) {
            console.error(`Push notification failed for ${u.id}:`, err);
          }
        }
      }
    }

    if (shouldSendEmail) {
      if (includeDrivers) {
        for (const driver of drivers) {
          if (driver.email) {
            try {
              await sendEmailNotification({
                to: driver.email,
                subject: notificationTitle,
                body: notificationBody,
                driverName: driver.full_name,
                rosterTitle: roster.title,
                actionUrl: fullActionUrl,
              });
              notificationResults.email++;
            } catch (err) {
              console.error(`Email notification failed for ${driver.email}:`, err);
            }
          }
        }
      }

      if (includeAdmins) {
        for (const u of adminUsers) {
          if (!u.email) continue;
          try {
            await sendEmailNotification({
              to: u.email,
              subject: notificationTitle,
              body: notificationBody,
              driverName: u.full_name || undefined,
              actionUrl: `${appUrl}/fleet/rosters`,
            });
            notificationResults.email++;
          } catch (err) {
            console.error(`Email notification failed for ${u.email}:`, err);
          }
        }
      }
    }

    if (rule) {
      await adminClient.from('notification_log').insert({
        organization_id: roster.organization_id,
        rule_id: rule.id,
        channel: effectiveChannel,
        title: notificationTitle,
        body: notificationBody,
        status: 'sent',
        metadata: {
          roster_id: roster.id,
          trigger_type: triggerType,
          target_role: effectiveTargetRole,
          results: notificationResults,
        },
        sent_at: new Date().toISOString(),
      });
    }
  }

  await createAuditLogEntry({
    actor,
    organizationId: roster.organization_id,
    action: 'update',
    entityType: 'roster_publish',
    entityId: roster.id,
    summary: `${isUpdate ? 'Republished' : 'Published'} roster \"${roster.title || roster.id}\"`,
    details: {
      roster_id: roster.id,
      title: roster.title,
      republish: isUpdate,
      notifications: notificationResults,
    },
  });

  return NextResponse.json({ 
    success: true, 
    message: isUpdate ? 'Roster updated and drivers notified' : 'Roster published and drivers notified',
    notifications: notificationResults,
  });
}
