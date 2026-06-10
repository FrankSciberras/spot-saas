// =============================================================================
// EMAIL — single Resend chokepoint + branded template (server only)
// =============================================================================
// Every application email goes through here. `sendEmail` is the one place that
// talks to Resend; `renderBrandedEmail` is the shared HTML shell so all mail
// looks like one product. Auth emails (password reset, signup confirm, invites)
// are sent by Supabase Auth — point Supabase's SMTP at Resend to route those
// through Resend too (see the project email memory / README).
//
// If RESEND_API_KEY is unset, sends are logged and return false (non-fatal), so
// local dev and unconfigured envs degrade gracefully.
// =============================================================================

import { Resend } from 'resend';

let client: Resend | null = null;

function getResendClient(): Resend | null {
  if (client) return client;
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) client = new Resend(apiKey);
  return client;
}

/** True when Resend is configured (RESEND_API_KEY present). */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** Sender identity. Override EMAIL_FROM with an address on your verified domain. */
export function emailFrom(): string {
  return process.env.EMAIL_FROM || 'Rovora <noreply@rovora.eu>';
}

export function appName(): string {
  return process.env.NEXT_PUBLIC_APP_NAME || 'Rovora';
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  /** Optional plaintext fallback. */
  text?: string;
  replyTo?: string;
}

/**
 * Send one email via Resend. Returns false (without throwing) when email isn't
 * configured or Resend reports an error, so callers can treat it as best-effort.
 */
export async function sendEmail({ to, subject, html, text, replyTo }: SendEmailInput): Promise<boolean> {
  const resend = getResendClient();
  if (!resend) {
    console.log(`[email] not configured (missing RESEND_API_KEY) — would send "${subject}" to ${Array.isArray(to) ? to.join(', ') : to}`);
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: emailFrom(),
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      ...(text ? { text } : {}),
      ...(replyTo ? { replyTo } : {}),
    });
    if (error) {
      console.error('[email] Resend error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[email] send failed:', err);
    return false;
  }
}

export interface BrandedEmailOptions {
  /** Big heading at the top of the card (often the same as the subject). */
  heading: string;
  /** Optional greeting line, e.g. "Hi Alex,". */
  greeting?: string;
  /** Main message. Plain text; newlines become paragraphs. */
  body: string;
  /** Optional call-to-action button. */
  actionUrl?: string;
  actionLabel?: string;
  /** Optional small print under the card. */
  footnote?: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The shared, brand-consistent HTML shell used by every app email. */
export function renderBrandedEmail(opts: BrandedEmailOptions): string {
  const name = appName();
  const paragraphs = opts.body
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('\n      ');

  const footnote = opts.footnote ?? `You received this email from ${escapeHtml(name)}.`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(opts.heading)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { text-align: center; margin-bottom: 24px; }
    .logo { font-size: 22px; font-weight: 700; color: #1a8f5a; }
    h1 { font-size: 20px; margin: 0 0 16px; color: #111; }
    p { margin: 0 0 16px; color: #555; }
    .button { display: inline-block; padding: 12px 24px; background: #1a8f5a; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 500; margin-top: 8px; }
    .footer { text-align: center; margin-top: 24px; font-size: 12px; color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header"><div class="logo">${escapeHtml(name)}</div></div>
      <h1>${escapeHtml(opts.heading)}</h1>
      ${opts.greeting ? `<p>${escapeHtml(opts.greeting)}</p>` : ''}
      ${paragraphs}
      ${opts.actionUrl ? `<a href="${opts.actionUrl}" class="button">${escapeHtml(opts.actionLabel || 'Open')}</a>` : ''}
    </div>
    <div class="footer"><p>${footnote}</p></div>
  </div>
</body>
</html>`;
}
