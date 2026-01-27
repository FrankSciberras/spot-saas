import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sendEmailNotification } from '@/lib/notifications/email';
import { sendPushNotification } from '@/lib/notifications/push';

/**
 * POST /api/shifts/check-service
 * 
 * Checks if a vehicle's mileage is approaching service due mileage
 * and creates a notification based on the "service_due" notification rule.
 * 
 * Body: { vehicle_id: string, current_mileage: number }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const adminClient = createAdminClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { vehicle_id, current_mileage } = body;

    if (!vehicle_id || current_mileage === undefined) {
      return NextResponse.json(
        { error: 'vehicle_id and current_mileage are required' },
        { status: 400 }
      );
    }

    // Resolve the current driver (if the authenticated user is a driver)
    const { data: currentDriver } = await adminClient
      .from('drivers')
      .select('id, user_id, full_name, users:user_id (email)')
      .eq('user_id', user.id)
      .maybeSingle();

    // Check if the service_due notification rule is active
    const { data: serviceRule, error: ruleError } = await adminClient
      .from('notification_rules')
      .select('*')
      .eq('trigger_type', 'service_due')
      .eq('is_active', true)
      .single();

    // Default threshold if no rule found - still create notifications
    let thresholdKm = 2000; // Default 2000km threshold
    let useDefaultTemplate = false;

    if (ruleError || !serviceRule) {
      // Rule doesn't exist or isn't active - use defaults
      console.log('Service due rule not found or inactive, using defaults. Error:', ruleError?.message);
      useDefaultTemplate = true;
    } else {
      // Get threshold from rule config
      thresholdKm = (serviceRule.trigger_config as { km_threshold?: number })?.km_threshold || 2000;
    }

    // Get the vehicle details
    const { data: vehicle, error: vehicleError } = await adminClient
      .from('vehicles')
      .select('id, registration_number, make, model')
      .eq('id', vehicle_id)
      .single();

    if (vehicleError || !vehicle) {
      return NextResponse.json(
        { error: 'Vehicle not found' },
        { status: 404 }
      );
    }

    // Get all services with next_service_mileage for this vehicle
    // Then find the one with highest mileage_at_service (most recent by mileage)
    const { data: servicesData, error: serviceError } = await adminClient
      .from('vehicle_services')
      .select('id, next_service_mileage, service_type, service_date, mileage_at_service')
      .eq('vehicle_id', vehicle_id)
      .not('next_service_mileage', 'is', null)
      .order('mileage_at_service', { ascending: false })
      .limit(1);

    const latestService = servicesData?.[0];

    if (serviceError || !latestService?.next_service_mileage) {
      // No service due configured, nothing to check
      return NextResponse.json({
        checked: true,
        alert_created: false,
        reason: 'No next_service_mileage configured for this vehicle'
      });
    }

    const nextServiceMileage = latestService.next_service_mileage;
    const kmRemaining = nextServiceMileage - current_mileage;

    // Check if service is due soon (within threshold)
    if (kmRemaining <= thresholdKm && kmRemaining > -1000) {
      // Check if we already sent a notification for this vehicle recently (within 24 hours)
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      
      const { data: existingNotif } = await adminClient
        .from('notifications')
        .select('id')
        .eq('action_url', `/admin/vehicles/${vehicle_id}`)
        .gte('created_at', oneDayAgo.toISOString())
        .limit(1)
        .single();

      if (existingNotif) {
        return NextResponse.json({
          checked: true,
          alert_created: false,
          reason: 'Notification already sent within 24 hours'
        });
      }

      // Build notification from rule template or use defaults
      let title: string;
      let notifBody: string;

      if (useDefaultTemplate || !serviceRule) {
        // Use default templates
        title = `Vehicle Service Due: ${vehicle.registration_number}`;
        notifBody = `${vehicle.registration_number} (${vehicle.make} ${vehicle.model}) needs service at ${nextServiceMileage.toLocaleString()} km. Current: ${current_mileage.toLocaleString()} km.`;
      } else {
        title = serviceRule.title_template
          .replace('{{vehicle_reg}}', vehicle.registration_number)
          .replace('{{next_service_mileage}}', nextServiceMileage.toLocaleString())
          .replace('{{km_remaining}}', kmRemaining.toString())
          .replace('{{current_mileage}}', current_mileage.toLocaleString());

        notifBody = serviceRule.body_template
          .replace('{{vehicle_reg}}', vehicle.registration_number)
          .replace('{{vehicle_make}}', vehicle.make)
          .replace('{{vehicle_model}}', vehicle.model)
          .replace('{{next_service_mileage}}', nextServiceMileage.toLocaleString())
          .replace('{{km_remaining}}', kmRemaining.toString())
          .replace('{{current_mileage}}', current_mileage.toLocaleString());
      }

      // Create notification
      const finalTitle = kmRemaining <= 0 ? `⚠️ OVERDUE: ${title}` : `🔧 ${title}`;
      const finalBody = kmRemaining <= 0 
        ? `OVERDUE by ${Math.abs(kmRemaining)} km! ${notifBody}`
        : `${kmRemaining} km remaining. ${notifBody}`;
      const notifType = kmRemaining <= 0 ? 'alert' : 'warning';

      const actionUrl = `/admin/vehicles/${vehicle_id}`;
      const effectiveTargetRole = serviceRule?.target_role || 'admin';

      const insertedNotificationIds: string[] = [];
      const nowIso = new Date().toISOString();

      // Create in-app notification(s) based on target_role
      let notifError: unknown = null;
      if (effectiveTargetRole === 'admin') {
        const { data: insertedNotif, error } = await adminClient
          .from('notifications')
          .insert({
            driver_id: null,
            title: finalTitle,
            body: finalBody,
            type: notifType,
            action_url: actionUrl,
            target_role: 'admin',
            sent_at: nowIso,
            created_at: nowIso,
          })
          .select('id')
          .single();
        if (error) notifError = error;
        if (insertedNotif?.id) insertedNotificationIds.push(insertedNotif.id);
      } else if (effectiveTargetRole === 'driver') {
        if (currentDriver?.id) {
          const { data: insertedNotif, error } = await adminClient
            .from('notifications')
            .insert({
              driver_id: currentDriver.id,
              title: finalTitle,
              body: finalBody,
              type: notifType,
              action_url: actionUrl,
              target_role: 'driver',
              sent_at: nowIso,
              created_at: nowIso,
            })
            .select('id')
            .single();
          if (error) notifError = error;
          if (insertedNotif?.id) insertedNotificationIds.push(insertedNotif.id);
        } else {
          console.warn('Service due rule targets drivers, but current user is not a driver - skipping driver in-app notification');
        }
      } else if (effectiveTargetRole === 'all') {
        const { data: insertedAdminNotif, error: adminError } = await adminClient
          .from('notifications')
          .insert({
            driver_id: null,
            title: finalTitle,
            body: finalBody,
            type: notifType,
            action_url: actionUrl,
            target_role: 'admin',
            sent_at: nowIso,
            created_at: nowIso,
          })
          .select('id')
          .single();

        if (adminError) notifError = adminError;
        if (insertedAdminNotif?.id) insertedNotificationIds.push(insertedAdminNotif.id);

        if (currentDriver?.id) {
          const { data: insertedDriverNotif, error: driverError } = await adminClient
            .from('notifications')
            .insert({
              driver_id: currentDriver.id,
              title: finalTitle,
              body: finalBody,
              type: notifType,
              action_url: actionUrl,
              target_role: 'driver',
              sent_at: nowIso,
              created_at: nowIso,
            })
            .select('id')
            .single();

          if (!notifError && driverError) notifError = driverError;
          if (insertedDriverNotif?.id) insertedNotificationIds.push(insertedDriverNotif.id);
        }
      }

      if (notifError) {
        console.error('Error creating service notification:', notifError);
        return NextResponse.json(
          { error: 'Failed to create notification', details: (notifError as { message?: string })?.message },
          { status: 500 }
        );
      }

      const effectiveChannel = serviceRule?.channel || 'app';
      const shouldSendEmail = effectiveChannel === 'email' || effectiveChannel === 'all';
      const shouldSendPush = effectiveChannel === 'push' || effectiveChannel === 'all';

      const pushResults: { sent: number; failed: number } | undefined = shouldSendPush
        ? { sent: 0, failed: 0 }
        : undefined;
      const emailResults: { sent: number; failed: number } | undefined = shouldSendEmail
        ? { sent: 0, failed: 0 }
        : undefined;

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
      const fullActionUrl = `${appUrl}${actionUrl}`;

      // Resolve recipients based on target_role
      const target = effectiveTargetRole;
      const recipients: { user_id: string; email: string | null; full_name: string | null }[] = [];

      if (target === 'admin' || target === 'all') {
        const { data: adminUsers, error: adminUsersError } = await adminClient
          .from('users')
          .select('id, email, full_name, role')
          .in('role', ['admin', 'staff']);

        if (adminUsersError) {
          console.error('Error fetching admin/staff users for service notification:', adminUsersError);
        }

        for (const u of adminUsers || []) {
          recipients.push({
            user_id: u.id,
            email: u.email,
            full_name: u.full_name,
          });
        }
      }

      if (target === 'driver' || target === 'all') {
        if (currentDriver?.user_id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const email = (currentDriver as any)?.users?.email || null;
          recipients.push({
            user_id: currentDriver.user_id,
            email,
            full_name: currentDriver.full_name || null,
          });
        } else {
          console.warn('Service due rule targets drivers, but current user is not a driver - skipping driver recipients');
        }
      }

      if (shouldSendEmail && emailResults) {
        for (const r of recipients) {
          if (!r.email) {
            emailResults.failed++;
            continue;
          }
          try {
            const sent = await sendEmailNotification({
              to: r.email,
              subject: finalTitle,
              body: finalBody,
              driverName: r.full_name || undefined,
              actionUrl: fullActionUrl,
            });
            if (sent) emailResults.sent++;
            else emailResults.failed++;
          } catch (err) {
            console.error(`Service notification email failed for ${r.email}:`, err);
            emailResults.failed++;
          }
        }
      }

      if (shouldSendPush && pushResults) {
        for (const r of recipients) {
          try {
            const sent = await sendPushNotification(r.user_id, {
              title: finalTitle,
              body: finalBody,
              url: actionUrl,
            });
            if (sent) pushResults.sent++;
            else pushResults.failed++;
          } catch (err) {
            console.error(`Service notification push failed for ${r.user_id}:`, err);
            pushResults.failed++;
          }
        }
      }

      // Log to notification_log (only if rule exists)
      if (serviceRule) {
        await adminClient
          .from('notification_log')
          .insert({
            rule_id: serviceRule.id,
            channel: effectiveChannel,
            title: finalTitle,
            body: finalBody,
            status: 'sent',
            metadata: {
              vehicle_id,
              vehicle_reg: vehicle.registration_number,
              current_mileage,
              next_service_mileage: nextServiceMileage,
              km_remaining: kmRemaining,
              target_role: effectiveTargetRole,
              email_results: emailResults,
              push_results: pushResults,
            },
            sent_at: new Date().toISOString(),
          });
      }
      
      console.log(`Service notification created for ${vehicle.registration_number}: ${kmRemaining} km remaining`);

      return NextResponse.json({
        checked: true,
        alert_created: true,
        notification_id: insertedNotificationIds[0] || null,
        notification_ids: insertedNotificationIds,
        km_remaining: kmRemaining,
        threshold_km: thresholdKm,
        target_role: effectiveTargetRole,
        email_results: emailResults,
        push_results: pushResults,
        message: `Service notification created: ${kmRemaining > 0 ? kmRemaining + ' km remaining' : Math.abs(kmRemaining) + ' km overdue'}`
      });
    }

    // Service not due soon
    return NextResponse.json({
      checked: true,
      alert_created: false,
      km_remaining: kmRemaining,
      threshold_km: thresholdKm,
      message: `Service not due yet (${kmRemaining} km remaining, threshold: ${thresholdKm} km)`
    });

  } catch (error) {
    console.error('Error checking service due:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
