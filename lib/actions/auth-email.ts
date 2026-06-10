'use server';

// =============================================================================
// AUTH EMAILS VIA RESEND — password reset that bypasses Supabase's mailer.
// =============================================================================
// Supabase's built-in/SMTP email path can fail silently ("Error sending recovery
// email") on misconfiguration. Since our Resend setup is proven working, we
// generate the recovery LINK with the admin API (generateLink does NOT send any
// email itself) and deliver it ourselves through the unified Resend mailer.
//
// Security notes:
//   * The token is still Supabase-issued, single-use and time-limited.
//   * Enumeration-safe: we always return ok, and only actually email an address
//     that belongs to a real user (so we can't be used to spam arbitrary inboxes).
// =============================================================================

import { createAdminClient } from '@/lib/supabase/server';
import { sendEmail, renderBrandedEmail, appName } from '@/lib/email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestPasswordResetAction(
  email: string
): Promise<{ ok: boolean; error?: string }> {
  const clean = email?.trim().toLowerCase() || '';
  if (!EMAIL_RE.test(clean)) return { ok: false, error: 'Enter a valid email address.' };

  const admin = createAdminClient();

  // Only send to a real account — keeps us from emailing arbitrary addresses.
  // Always return ok regardless, so we don't reveal whether an account exists.
  const { data: user } = await admin.from('users').select('id').eq('email', clean).maybeSingle();
  if (!user) return { ok: true };

  // Rate limit: at most one reset email per address per minute. Atomic claim in
  // the DB (race-safe). Fail-open if the function isn't deployed yet, so the
  // reset flow never silently breaks before the migration is applied.
  const { data: allowed, error: throttleErr } = await admin.rpc('claim_password_reset', {
    p_email: clean,
    p_cooldown: 60,
  });
  if (!throttleErr && allowed === false) {
    // Within cooldown — pretend success without re-sending.
    return { ok: true };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: clean,
    options: { redirectTo: `${appUrl}/auth/callback?type=recovery` },
  });

  const link = data?.properties?.action_link;
  if (error || !link) {
    console.error('requestPasswordResetAction generateLink failed:', error);
    return { ok: false, error: 'Could not start the reset. Please try again.' };
  }

  const html = renderBrandedEmail({
    heading: 'Reset your password',
    body:
      `We received a request to reset the password for your ${appName()} account. ` +
      `Click the button below to choose a new password. This link expires in 1 hour.\n\n` +
      `If you didn't request this, you can safely ignore this email — your password won't change.\n\n` +
      `Trouble with the button? Copy and paste this link into your browser:\n${link}`,
    actionUrl: link,
    actionLabel: 'Reset password',
  });

  await sendEmail({ to: clean, subject: 'Reset your password', html });
  return { ok: true };
}
