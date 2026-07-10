'use server';

// =============================================================================
// AUTH EMAILS VIA RESEND — password reset + signup confirmation codes that
// bypass Supabase's mailer.
// =============================================================================
// Supabase's built-in/SMTP email path can fail silently ("Error sending recovery
// email") on misconfiguration. Since our Resend setup is proven working, we
// generate the recovery LINK / signup OTP with the admin API (generateLink does
// NOT send any email itself) and deliver it ourselves through the unified
// Resend mailer.
//
// Security notes:
//   * Tokens/codes are still Supabase-issued, single-use and time-limited.
//   * Enumeration-safe where it matters: password reset always returns ok; the
//     signup path only emails codes, never reveals more than the signup form
//     itself already would.
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

// ─── Signup email verification (6-digit code) ────────────────────────────────
// With "Confirm email" enabled in Supabase, we never call the client signUp()
// (that would trigger Supabase's broken SMTP). Instead the account is created
// here via admin.generateLink({type:'signup'}), which returns the email OTP
// without sending anything, and we deliver the code through Resend. The client
// then calls supabase.auth.verifyOtp({email, token, type}) which confirms the
// address AND signs the user in, in one step.

/** Which verifyOtp `type` the client must use for the code we just sent. */
export type SignupVerifyType = 'signup' | 'email';

interface SignupCodeResult {
  ok: boolean;
  error?: string;
  verifyType?: SignupVerifyType;
  /** True when Supabase auto-confirmed the account ("Confirm email" still off) —
   *  no code needed; the client can sign straight in with the password. */
  alreadyConfirmed?: boolean;
}

async function sendCodeEmail(to: string, code: string): Promise<boolean> {
  const html = renderBrandedEmail({
    heading: 'Verify your email',
    body:
      `Welcome to ${appName()}! Enter this code on the sign-up screen to verify your email address:\n\n` +
      `${code}\n\n` +
      `For your security the code is single-use and expires shortly. ` +
      `If you didn't create a ${appName()} account, you can safely ignore this email.`,
  });
  return sendEmail({ to, subject: `${code} is your ${appName()} verification code`, html });
}

/** True when the auth user behind this email has already confirmed it. */
async function isEmailConfirmed(admin: ReturnType<typeof createAdminClient>, email: string): Promise<boolean | null> {
  const { data: row } = await admin.from('users').select('id').eq('email', email).maybeSingle();
  if (!row) return null; // unknown — no mirror row
  const { data } = await admin.auth.admin.getUserById((row as { id: string }).id);
  return data?.user ? !!data.user.email_confirmed_at : null;
}

/** Fresh signup: create the (unconfirmed) account and email the 6-digit code. */
export async function requestSignupCodeAction(email: string, password: string): Promise<SignupCodeResult> {
  const clean = email?.trim().toLowerCase() || '';
  if (!EMAIL_RE.test(clean)) return { ok: false, error: 'Enter a valid email address.' };
  if (!password || password.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };

  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'signup',
    email: clean,
    password,
  });

  // If the dashboard's "Confirm email" toggle is still OFF, Supabase confirms
  // the account at creation — no code round-trip is possible or needed.
  if (!error && data?.user?.email_confirmed_at) {
    return { ok: true, alreadyConfirmed: true };
  }

  const otp = data?.properties?.email_otp;
  if (!error && otp) {
    const sent = await sendCodeEmail(clean, otp);
    if (!sent) return { ok: false, error: 'Could not send the verification email. Please try again.' };
    return { ok: true, verifyType: 'signup' };
  }

  // The address is already registered. If it's verified, point them at sign-in;
  // if it's a half-finished signup, send a fresh code instead of a dead end.
  if (error && /already|registered|exists/i.test(error.message)) {
    const confirmed = await isEmailConfirmed(admin, clean);
    if (confirmed === true) {
      return { ok: false, error: 'An account with this email already exists — sign in instead.' };
    }
    return resendSignupCodeAction(clean);
  }

  console.error('requestSignupCodeAction generateLink failed:', error);
  return { ok: false, error: error?.message || 'Could not create the account. Please try again.' };
}

/** Re-send a verification code to an existing, not-yet-confirmed account. */
export async function resendSignupCodeAction(email: string): Promise<SignupCodeResult> {
  const clean = email?.trim().toLowerCase() || '';
  if (!EMAIL_RE.test(clean)) return { ok: false, error: 'Enter a valid email address.' };

  const admin = createAdminClient();

  // Cooldown: reuse the atomic reset throttle with a distinct key namespace so
  // signup codes can't be spammed. Fail-open like the reset flow.
  const { data: allowed, error: throttleErr } = await admin.rpc('claim_password_reset', {
    p_email: `signup:${clean}`,
    p_cooldown: 60,
  });
  if (!throttleErr && allowed === false) {
    // Within cooldown — report success without re-sending.
    return { ok: true, verifyType: 'email' };
  }

  const confirmed = await isEmailConfirmed(admin, clean);
  if (confirmed === true) {
    return { ok: false, error: 'This email is already verified — sign in instead.' };
  }

  // A magiclink OTP both signs the user in and marks the email verified.
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: clean });
  const otp = data?.properties?.email_otp;
  if (error || !otp) {
    console.error('resendSignupCodeAction generateLink failed:', error);
    return { ok: false, error: 'Could not send a new code. Please try again.' };
  }

  const sent = await sendCodeEmail(clean, otp);
  if (!sent) return { ok: false, error: 'Could not send the verification email. Please try again.' };
  return { ok: true, verifyType: 'email' };
}
