// =============================================================================
// NOTIFICATION EMAILS — thin wrapper over the unified Resend mailer (lib/email).
// =============================================================================
// Kept as a stable entry point for the notification call sites (rosters, alerts,
// the rules engine, platform broadcasts). All actual sending + branding now lives
// in lib/email so there is a single Resend chokepoint.
// =============================================================================

import { sendEmail, renderBrandedEmail, isEmailConfigured as configured, appName } from '@/lib/email';

interface EmailNotificationParams {
  to: string;
  subject: string;
  body: string;
  driverName?: string;
  rosterTitle?: string;
  actionUrl?: string;
}

/** Send a branded notification email via Resend. Best-effort (returns boolean). */
export async function sendEmailNotification(params: EmailNotificationParams): Promise<boolean> {
  const { to, subject, body, driverName, rosterTitle, actionUrl } = params;

  const fullBody = rosterTitle ? `${body}\n\nRoster: ${rosterTitle}` : body;

  const html = renderBrandedEmail({
    heading: subject,
    greeting: driverName ? `Hi ${driverName},` : undefined,
    body: fullBody,
    actionUrl,
    actionLabel: 'View details',
  });

  return sendEmail({
    to,
    subject: `${appName()} - ${subject}`,
    html,
  });
}

/** Check if email is configured (RESEND_API_KEY present). */
export function isEmailConfigured(): boolean {
  return configured();
}
