// =============================================================================
// The sign-up funnel, step by step — shared by the pages that report each step
// and the admin page that draws it (Admin Console → Analytics → Sign-up funnel).
// =============================================================================
// The marketing analytics already knew two things: someone clicked "Get started
// free", and (much later) a fleet existed. Everything in between — the form,
// the emailed code, five onboarding screens — was a black box, so a sign-up
// that stalled looked the same wherever it stalled.
//
// Two sources fill that in:
//
//   Before the account exists  (the sign-up form and the code screen, on the
//   public site)               → anonymous analytics events, below.
//
//   After it exists            (onboarding)  → the furthest step reached is
//   kept on the ACCOUNT itself (auth app_metadata), not in the anonymous
//   analytics. That keeps website analytics out of the signed-in app, and it
//   is what lets the admin see "this person stopped at step 3" and follow up.
//
// Never put an email address or anything typed by the visitor in an event —
// labels are the fixed strings in this file.
// =============================================================================

/** Event names in analytics_events. */
export const SIGNUP_STEP_EVENT = 'Signup step';
export const SIGNUP_ERROR_EVENT = 'Signup error';

/** Steps reported from the sign-up form / code screen, in funnel order. */
export const SIGNUP_STEPS = [
  { id: 'Form viewed', title: 'Saw the sign-up form', hint: 'Opened the “Get started free” form (or the sign-up panel in the website chat)' },
  { id: 'Form started', title: 'Started typing', hint: 'Typed into the email field, or chose Google' },
  { id: 'Submitted', title: 'Pressed “Create account”', hint: 'Submitted the email form, or finished the Google pop-up' },
  { id: 'Code sent', title: 'Was emailed a code', hint: 'Account created and the 6-digit code sent (email sign-ups only)' },
  { id: 'Email verified', title: 'Verified their email', hint: 'Entered the code correctly, or signed up with Google' },
] as const;

export type SignupStepId = (typeof SIGNUP_STEPS)[number]['id'] | 'Code resent';

/** Why a sign-up attempt failed — one fixed label per kind of failure. */
export const SIGNUP_ERRORS = {
  'Wrong or expired code': 'They typed a code that didn’t match or had expired',
  'Already registered': 'The email already has a verified account — a returning customer on the wrong form',
  'Asked to wait': 'Hit the limit on how often a code can be requested',
  'Email not sent': 'Our email provider refused or failed to send the code',
  'Invalid email': 'The address wasn’t a valid email',
  'Weak password': 'The password was rejected (too short or too simple)',
  'Google sign-in failed': 'The Google pop-up finished but the sign-in was refused',
  Other: 'Anything else — check the server logs around that time',
} as const;

export type SignupErrorKind = keyof typeof SIGNUP_ERRORS;

/** Sort an error message shown on the sign-up screens into one of the kinds above. */
export function signupErrorKind(message: string | null | undefined): SignupErrorKind {
  const m = (message ?? '').toLowerCase();
  if (/code is invalid|has expired|invalid or has expired|token|otp/.test(m)) return 'Wrong or expired code';
  if (/already verified|already registered|already exists|sign in instead/.test(m)) return 'Already registered';
  if (/please wait|paused sending|too many|rate limit/.test(m)) return 'Asked to wait';
  if (/could not send|verification email/.test(m)) return 'Email not sent';
  if (/valid email/.test(m)) return 'Invalid email';
  if (/password/.test(m)) return 'Weak password';
  if (/google/.test(m)) return 'Google sign-in failed';
  return 'Other';
}

/** The onboarding screens, in order. `step` is 1-based and stored on the account. */
export const ONBOARDING_STEPS = [
  { step: 1, title: 'Fleet name' },
  { step: 2, title: 'How many drivers' },
  { step: 3, title: 'How many vehicles' },
  { step: 4, title: 'Choose tools' },
  { step: 5, title: 'Pick a plan' },
] as const;

/** Where the browser reports onboarding progress (see the route for why it's not a beacon to /api/rv). */
export const ONBOARDING_PROGRESS_PATH = '/api/auth/onboarding-progress';

/** Keys on the auth user's app_metadata. Only the server can write these. */
export const ONBOARDING_STEP_KEY = 'onb_step';
export const ONBOARDING_AT_KEY = 'onb_at';

/**
 * The code screen lives in React state, so a page reload used to lose it — and
 * phones reload the tab all the time while someone is off in their email app
 * fetching the code. The address being verified is remembered in sessionStorage
 * (this tab only, gone when it closes) so the screen can be put back.
 */
export const PENDING_VERIFY_KEY = 'rv_pending_verify';
/** Supabase email codes last an hour; don't offer the code screen past that. */
export const PENDING_VERIFY_MAX_AGE_MS = 55 * 60_000;
