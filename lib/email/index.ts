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
import { appUrl, assetUrl } from '@/lib/urls';

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
  /**
   * A short code to show on its own, large and spaced out (verification codes).
   * Rendered as a panel rather than buried mid-paragraph.
   */
  code?: string;
  /** Inbox preview line. Defaults to the opening of the body. */
  preheader?: string;
  /** Optional small print under the card. */
  footnote?: string;
  /**
   * The "or paste this link" block under the button. On by default whenever
   * there's an action, since some clients mangle buttons — pass false for
   * internal mail where the raw URL is just noise.
   */
  showLinkFallback?: boolean;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Escape for use inside a double-quoted HTML attribute (href, src). */
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

// ─── Brand tokens ────────────────────────────────────────────────────────────
// Mirrors the light palette in app/rovora-site.css. Hard-coded rather than
// imported because email HTML can't use CSS variables — most clients strip
// them, so every value has to be a literal, inline on the element.
const BRAND = {
  accent: '#1a8f5a',
  accentDark: '#14784a',
  pageBg: '#f6f7f9',
  cardBg: '#ffffff',
  panelBg: '#f1f3f7',
  line: '#e6e8ec',
  text1: '#0e1116',
  text2: '#4a5260',
  text3: '#7a8290',
} as const;

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * The shared HTML shell used by every application email.
 *
 * Built on tables with inline styles on purpose. Email clients are not
 * browsers: Outlook renders through Word, Gmail strips most of a <style> block,
 * and flexbox/grid/CSS-variable layouts collapse. Tables + inline styles are
 * the only combination that survives everywhere.
 */
export function renderBrandedEmail(opts: BrandedEmailOptions): string {
  const name = appName();
  const logoSrc = assetUrl('/logo-full.png');
  const siteHref = appUrl();

  const paragraphs = opts.body
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.65;color:${BRAND.text2};">${escapeHtml(p)}</p>`,
    )
    .join('\n              ');

  // The inbox preview line. Without one, clients scrape whatever text comes
  // first — usually the greeting, which tells the reader nothing.
  const preheader = (opts.preheader ?? opts.body.split(/\n/)[0] ?? '').slice(0, 140);

  const greeting = opts.greeting
    ? `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:1.65;color:${BRAND.text1};font-weight:600;">${escapeHtml(opts.greeting)}</p>`
    : '';

  const codeBlock = opts.code
    ? `
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;">
                <tr>
                  <td align="center" style="background:${BRAND.panelBg};border:1px solid ${BRAND.line};border-radius:12px;padding:20px 16px;">
                    <div style="font-family:'SF Mono',SFMono-Regular,Menlo,Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:8px;color:${BRAND.text1};line-height:1.2;">${escapeHtml(opts.code)}</div>
                  </td>
                </tr>
              </table>`
    : '';

  // Bulletproof-ish button: the background lives on the <td> so clients that
  // drop padding or radius on the <a> still render a solid green block.
  const button = opts.actionUrl
    ? `
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:6px 0 4px;">
                <tr>
                  <td align="center" bgcolor="${BRAND.accent}" style="border-radius:10px;">
                    <a href="${escapeAttr(opts.actionUrl)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(opts.actionLabel || 'Open')}</a>
                  </td>
                </tr>
              </table>`
    : '';

  // Kept small, muted and below the button — a raw action link is a fallback,
  // not the main event. It used to be pasted into the body above the button,
  // where a wrapped 200-character URL was the loudest thing in the email.
  const showFallback = opts.showLinkFallback ?? Boolean(opts.actionUrl);
  const linkFallback =
    showFallback && opts.actionUrl
      ? `
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:22px 0 0;">
                <tr>
                  <td style="background:${BRAND.pageBg};border:1px solid ${BRAND.line};border-radius:10px;padding:14px 16px;">
                    <div style="font-family:${FONT};font-size:12px;color:${BRAND.text3};margin-bottom:6px;">Button not working? Paste this link into your browser:</div>
                    <a href="${escapeAttr(opts.actionUrl)}" target="_blank" rel="noopener" style="font-family:${FONT};font-size:12px;line-height:1.5;color:${BRAND.text2};text-decoration:underline;word-break:break-all;">${escapeHtml(opts.actionUrl)}</a>
                  </td>
                </tr>
              </table>`
      : '';

  const footnote = opts.footnote ?? `You received this email from ${name}.`;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(opts.heading)}</title>
  <style>
    /* Progressive enhancement only — every rule that matters is inline. */
    @media only screen and (max-width: 620px) {
      .rv-card { padding: 26px 22px !important; }
      .rv-h1 { font-size: 20px !important; }
      .rv-wrap { padding: 20px 12px !important; }
    }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
  </style>
</head>
<body style="margin:0;padding:0;background:${BRAND.pageBg};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background:${BRAND.pageBg};">
    <tr>
      <td align="center" class="rv-wrap" style="padding:32px 16px;">
        <table role="presentation" width="600" border="0" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">

          <tr>
            <td align="center" style="padding:0 0 22px;">
              <a href="${escapeAttr(siteHref)}" target="_blank" rel="noopener" style="text-decoration:none;">
                <img src="${escapeAttr(logoSrc)}" width="132" alt="${escapeAttr(name)}" style="display:block;width:132px;max-width:132px;height:auto;border:0;outline:none;font-family:${FONT};font-size:19px;font-weight:700;color:${BRAND.accent};text-decoration:none;" />
              </a>
            </td>
          </tr>

          <tr>
            <td class="rv-card" style="background:${BRAND.cardBg};border:1px solid ${BRAND.line};border-radius:14px;padding:34px 36px;">
              <h1 class="rv-h1" style="margin:0 0 18px;font-family:${FONT};font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.01em;color:${BRAND.text1};">${escapeHtml(opts.heading)}</h1>
              ${greeting}
              ${paragraphs}
              ${codeBlock}
              ${button}
              ${linkFallback}
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:22px 12px 0;">
              <p style="margin:0 0 8px;font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.text3};">${escapeHtml(footnote)}</p>
              <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${BRAND.text3};">
                <a href="${escapeAttr(siteHref)}" target="_blank" rel="noopener" style="color:${BRAND.text3};text-decoration:underline;">${escapeHtml(name)}</a>
                &nbsp;·&nbsp; Fleet management for taxi &amp; rideshare operators
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
