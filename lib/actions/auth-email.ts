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

import { headers } from 'next/headers';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { sendEmail, renderBrandedEmail, appName } from '@/lib/email';
import { appUrl } from '@/lib/urls';
import { AUTH_EMAIL_LIMITS, type AuthEmailKind, type AuthEmailLimit } from '@/lib/auth/email-limits';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AdminClient = ReturnType<typeof createAdminClient>;

// ─── Rate limiting ───────────────────────────────────────────────────────────
// The login page has "Resend" buttons, so these limits are what actually stop
// someone scripting them to flood an inbox or burn our Resend quota. The
// numbers live in lib/auth/email-limits; they're enforced atomically in the DB
// (supabase/migrations/20261004_auth_email_rate_limit.sql). The UI countdown
// is only a courtesy — this is the real gate.

/** Caller's IP as set by our proxy (Traefik overwrites any client-sent value). */
async function callerIp(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd || h.get('x-real-ip')?.trim() || null;
}

/** 0 = allowed (and recorded), otherwise seconds until this bucket frees up. */
async function claimBucket(admin: AdminClient, key: string, limit: AuthEmailLimit): Promise<number> {
  const { data, error } = await admin.rpc('claim_auth_email', {
    p_key: key,
    p_cooldown: limit.cooldown,
    p_max: limit.max,
    p_window: limit.window,
  });
  if (!error) return Number(data) || 0;

  // Migration not applied yet — fall back to the older cooldown-only throttle so
  // a deploy that lands first is never unprotected. Fail-open if that's missing
  // too, so emails never silently stop working.
  if (limit.cooldown <= 0) return 0;
  const { data: allowed, error: oldErr } = await admin.rpc('claim_password_reset', {
    p_email: key,
    p_cooldown: limit.cooldown,
  });
  return !oldErr && allowed === false ? limit.cooldown : 0;
}

/**
 * Claims one auth email for this address + caller. Returns 0 when it may be sent,
 * else seconds to wait. Keyed on the address whether or not an account exists,
 * so the answer never hints at which emails are registered.
 */
async function claimAuthEmail(admin: AdminClient, kind: AuthEmailKind, email: string): Promise<number> {
  const ip = await callerIp();
  if (ip) {
    const wait = await claimBucket(admin, `${kind}-ip:${ip}`, AUTH_EMAIL_LIMITS[kind].ip);
    if (wait) return wait;
  }
  return claimBucket(admin, `${kind}:${email}`, AUTH_EMAIL_LIMITS[kind].email);
}

/** Friendly "slow down" text. Short waits are the cooldown; long ones the cap. */
function waitMessage(seconds: number, what: string): string {
  if (seconds <= 120) return `Please wait ${seconds} seconds before requesting another ${what}.`;
  const mins = Math.ceil(seconds / 60);
  return (
    `You’ve requested several ${what}s in a short time, so we’ve paused sending for about ` +
    `${mins} minute${mins === 1 ? '' : 's'}. Check your spam or junk folder in the meantime.`
  );
}

export async function requestPasswordResetAction(
  email: string
): Promise<{ ok: boolean; error?: string; retryAfter?: number }> {
  const clean = email?.trim().toLowerCase() || '';
  if (!EMAIL_RE.test(clean)) return { ok: false, error: 'Enter a valid email address.' };

  const admin = createAdminClient();

  // Rate limit BEFORE looking the account up, so real and made-up addresses get
  // identical answers (no "is this email registered?" probing via the limiter).
  const wait = await claimAuthEmail(admin, 'reset', clean);
  if (wait) return { ok: false, retryAfter: wait, error: waitMessage(wait, 'reset link') };

  // Only send to a real account — keeps us from emailing arbitrary addresses.
  // Always return ok regardless, so we don't reveal whether an account exists.
  const { data: user } = await admin.from('users').select('id').eq('email', clean).maybeSingle();
  if (!user) return { ok: true };

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: clean,
    options: { redirectTo: `${appUrl()}/auth/callback?type=recovery` },
  });

  const link = data?.properties?.action_link;
  if (error || !link) {
    console.error('requestPasswordResetAction generateLink failed:', error);
    return { ok: false, error: 'Could not start the reset. Please try again.' };
  }

  const html = renderBrandedEmail({
    heading: 'Reset your password',
    preheader: `Choose a new password for your ${appName()} account. This link expires in 1 hour.`,
    body:
      `We received a request to reset the password for your ${appName()} account. ` +
      `Click the button below to choose a new password. This link expires in 1 hour.\n\n` +
      `If you didn't request this, you can safely ignore this email — your password won't change.`,
    actionUrl: link,
    actionLabel: 'Reset password',
    footnote: 'For your security this link can only be used once.',
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
  /** Set when rate-limited: seconds until another code may be requested. */
  retryAfter?: number;
  /** True when Supabase auto-confirmed the account ("Confirm email" still off) —
   *  no code needed; the client can sign straight in with the password. */
  alreadyConfirmed?: boolean;
}

async function sendCodeEmail(to: string, code: string): Promise<boolean> {
  const html = renderBrandedEmail({
    heading: 'Verify your email',
    preheader: `${code} is your ${appName()} verification code.`,
    body: `Welcome to ${appName()}! Enter this code on the sign-up screen to verify your email address:`,
    code,
    footnote:
      `The code is single-use and expires shortly. ` +
      `If you didn't create a ${appName()} account, you can safely ignore this email.`,
  });
  return sendEmail({ to, subject: `${code} is your ${appName()} verification code`, html });
}

/** True when the auth user behind this email has already confirmed it. */
async function isEmailConfirmed(admin: AdminClient, email: string): Promise<boolean | null> {
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

  // Each signup emails a code, so it's rate-limited like a resend — otherwise
  // the form could be used to mail codes to a list of strangers' addresses.
  const wait = await claimAuthEmail(admin, 'signup', clean);
  if (wait) return { ok: false, retryAfter: wait, error: waitMessage(wait, 'code') };

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
    return deliverFreshCode(admin, clean);
  }

  console.error('requestSignupCodeAction generateLink failed:', error);
  return { ok: false, error: error?.message || 'Could not create the account. Please try again.' };
}

/** Re-send a verification code to an existing, not-yet-confirmed account. */
export async function resendSignupCodeAction(email: string): Promise<SignupCodeResult> {
  const clean = email?.trim().toLowerCase() || '';
  if (!EMAIL_RE.test(clean)) return { ok: false, error: 'Enter a valid email address.' };

  const admin = createAdminClient();

  const wait = await claimAuthEmail(admin, 'signup', clean);
  if (wait) return { ok: false, retryAfter: wait, error: waitMessage(wait, 'code') };

  return deliverFreshCode(admin, clean);
}

/** Emails a new code to an existing account. Caller has already rate-limited. */
async function deliverFreshCode(admin: AdminClient, clean: string): Promise<SignupCodeResult> {
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

// ─────────────────────────────────────────────────────────────────────────────
// SIGN-UP FROM THE WEBSITE CHAT
// ─────────────────────────────────────────────────────────────────────────────
// The marketing assistant can start a trial without sending the visitor to
// /login — the fewer steps between "I'm interested" and "I have an account",
// the more trials actually start.
//
// These wrap the same flow the login page runs, but do the session-creating
// half on the SERVER. That matters twice over: the session cookie is set by the
// action itself (no client-side auth round-trip), and — because the chat widget
// is mounted on every marketing page — it keeps supabase-js out of the public
// site's JS bundle, which is otherwise a needless ~50KB on pages built to be
// fast and crawlable.

export interface ChatSignupResult {
  /** 'code' — a verification code was emailed; 'signed_in' — session is live. */
  status?: 'code' | 'signed_in';
  verifyType?: SignupVerifyType;
  error?: string;
}

/**
 * Create the trial account from the chat. Returns either "check your email for a
 * code" or, when Supabase auto-confirms, a live session ready for /onboarding.
 */
export async function chatSignupAction(email: string, password: string): Promise<ChatSignupResult> {
  const clean = email?.trim().toLowerCase() || '';
  const res = await requestSignupCodeAction(clean, password);
  if (!res.ok) return { error: res.error || 'Could not create the account. Please try again.' };

  // Email confirmation is switched off in Supabase, so the account is already
  // usable — sign in here rather than dead-ending on a code that never arrives.
  if (res.alreadyConfirmed) {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: clean, password });
    if (error) return { error: 'Account created — please sign in to continue.' };
    return { status: 'signed_in' };
  }

  return { status: 'code', verifyType: res.verifyType ?? 'signup' };
}

/**
 * Verify the emailed code and sign the visitor in. Runs server-side so the
 * session cookie is written by this action.
 */
export async function chatVerifyCodeAction(
  email: string,
  code: string,
  verifyType: SignupVerifyType = 'signup',
): Promise<{ ok: boolean; error?: string }> {
  const clean = email?.trim().toLowerCase() || '';
  const token = code?.replace(/\D/g, '') || '';
  if (!EMAIL_RE.test(clean)) return { ok: false, error: 'Enter a valid email address.' };
  if (token.length < 6) return { ok: false, error: 'Enter the 6-digit code from your email.' };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email: clean,
    token,
    type: verifyType === 'email' ? 'email' : 'signup',
  });

  if (error || !data.session) {
    return {
      ok: false,
      error: /expired|invalid/i.test(error?.message || '')
        ? 'That code is invalid or has expired — check the digits, or resend a fresh one.'
        : error?.message || 'Could not verify that code. Please try again.',
    };
  }
  return { ok: true };
}
