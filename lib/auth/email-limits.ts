// =============================================================================
// AUTH-EMAIL LIMITS — how often password-reset links and signup codes may go out
// =============================================================================
// Shared by the server actions that enforce them (lib/actions/auth-email.ts)
// and the login page, whose "Resend" countdowns mirror the cooldowns. Lives
// outside the 'use server' file because those may only export async functions.
//
// Every send must clear BOTH buckets:
//   * per ADDRESS — a cooldown between emails + an hourly cap, so one inbox
//     can't be flooded no matter how many machines are asking;
//   * per IP      — an hourly cap, so one machine can't spray many inboxes.
// =============================================================================

export interface AuthEmailLimit {
  /** Minimum seconds between two sends. */
  cooldown: number;
  /** Most sends allowed per window. */
  max: number;
  /** Window length in seconds (starts at the first send). */
  window: number;
}

export const AUTH_EMAIL_LIMITS = {
  reset: {
    email: { cooldown: 120, max: 5, window: 3600 },
    ip: { cooldown: 0, max: 30, window: 3600 },
  },
  signup: {
    email: { cooldown: 60, max: 5, window: 3600 },
    ip: { cooldown: 0, max: 30, window: 3600 },
  },
} satisfies Record<string, { email: AuthEmailLimit; ip: AuthEmailLimit }>;

export type AuthEmailKind = keyof typeof AUTH_EMAIL_LIMITS;

/** Seconds the reset screen makes people wait before "Resend" unlocks. */
export const RESET_RESEND_COOLDOWN = AUTH_EMAIL_LIMITS.reset.email.cooldown;
/** Same for the signup verification-code screen. */
export const SIGNUP_RESEND_COOLDOWN = AUTH_EMAIL_LIMITS.signup.email.cooldown;
