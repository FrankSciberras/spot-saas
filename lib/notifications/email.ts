import { Resend } from 'resend';

// Initialize Resend client (or use nodemailer as fallback)
const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

interface EmailNotificationParams {
  to: string;
  subject: string;
  body: string;
  driverName?: string;
  rosterTitle?: string;
  actionUrl?: string;
}

/**
 * Send email notification
 * Uses Resend API if configured, otherwise logs the email
 */
export async function sendEmailNotification(params: EmailNotificationParams): Promise<boolean> {
  const { to, subject, body, driverName, rosterTitle, actionUrl } = params;

  // Check if email is configured
  if (!resend) {
    console.log('Email notifications not configured (missing RESEND_API_KEY)');
    console.log(`Would send email to ${to}: ${subject}`);
    return false;
  }

  try {
    // Use Resend's test domain if no verified domain is configured
    const fromEmail = process.env.EMAIL_FROM || 'SPOT Dashboard <onboarding@resend.dev>';
    const appName = process.env.NEXT_PUBLIC_APP_NAME || 'SPOT Dashboard';
    
    console.log(`Sending email to ${to} from ${fromEmail}`);

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 24px; }
    .logo { font-size: 24px; font-weight: 700; color: #6366f1; }
    h1 { font-size: 20px; margin: 0 0 16px; color: #111; }
    p { margin: 0 0 16px; color: #555; }
    .button { display: inline-block; padding: 12px 24px; background: #6366f1; color: white !important; text-decoration: none; border-radius: 8px; font-weight: 500; margin-top: 16px; }
    .footer { text-align: center; margin-top: 24px; font-size: 12px; color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">${appName}</div>
      </div>
      <h1>${subject}</h1>
      ${driverName ? `<p>Hi ${driverName},</p>` : ''}
      <p>${body}</p>
      ${rosterTitle ? `<p><strong>Roster:</strong> ${rosterTitle}</p>` : ''}
      ${actionUrl ? `<a href="${actionUrl}" class="button">View Roster</a>` : ''}
    </div>
    <div class="footer">
      <p>You received this email because you are registered as a driver on ${appName}.</p>
    </div>
  </div>
</body>
</html>
    `;

    const { error } = await resend.emails.send({
      from: fromEmail,
      to: [to],
      subject: `${appName} - ${subject}`,
      html: htmlContent,
    });

    if (error) {
      console.error('Resend email error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Email notification error:', error);
    return false;
  }
}

/**
 * Check if email notifications are configured
 */
export function isEmailConfigured(): boolean {
  return Boolean(resendApiKey);
}
