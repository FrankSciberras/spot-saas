// =============================================================================
// "FINISH SETTING UP" EMAIL — for someone who started signing up and stopped.
// =============================================================================
// Two places a sign-up stalls before a fleet exists, each with its own email:
//
//   unverified  made an account, never entered the emailed code
//   no_fleet    verified (or used Google), never finished onboarding
//
// Sent by app/api/cron/signup-reminders. At most two per account, ever — and
// only one to an address that was never verified, because we can't be sure the
// person who typed it owns it. Best-effort: failures are logged.
// =============================================================================

import { appName, renderBrandedEmail, sendEmail } from '@/lib/email';
import { appUrl } from '@/lib/urls';
import { trialSpan } from '@/lib/billing/trial-offer';
import { ONBOARDING_STEPS } from '@/lib/analytics/signup-funnel';

export interface SignupReminderInput {
  to: string;
  stage: 'unverified' | 'no_fleet';
  /** 1 = the nudge about an hour in; 2 = the last one, a few days later. */
  round: 1 | 2;
  /** Furthest onboarding screen reached (1-5), when known. */
  step?: number | null;
  /** Length of the free trial on offer, in days. */
  trialDays: number;
}

const inbox = () => process.env.CONTACT_INBOX || 'hello@rovora.eu';

export function buildSignupReminderEmail(input: SignupReminderInput): { subject: string; html: string; text: string } {
  const name = appName();
  const base = appUrl();
  const span = trialSpan(input.trialDays);
  const demoUrl = `${base}/contact?topic=onboarding`;

  let subject: string;
  let body: string;
  let actionUrl: string;
  let actionLabel: string;
  let footnote: string;

  if (input.stage === 'unverified') {
    subject = `Your ${name} account is one step from ready`;
    body =
      `You started creating a ${name} account but the email code was never entered — ` +
      `codes expire quickly, and they do sometimes land in spam.\n\n` +
      `Sign in with the email and password you chose and we'll send a fresh code straight away. ` +
      `After that it's about a minute to your fleet dashboard: ${span} free, no card needed.`;
    actionUrl = `${base}/login`;
    actionLabel = 'Sign in and get a new code';
    footnote =
      `If you didn't create a ${name} account, ignore this email — nothing will happen and we won't write again.`;
  } else {
    const left = input.step ? Math.max(1, ONBOARDING_STEPS.length - input.step + 1) : null;
    subject = input.round === 1 ? `Your ${name} fleet is almost set up` : `Still want to try ${name}?`;
    body =
      input.round === 1
        ? `Your ${name} account is ready — the only thing missing is your fleet. ` +
          (left ? `You're ${left === 1 ? 'one short screen' : `${left} short screens`} from the dashboard` : `It takes about a minute`) +
          `, and nothing you pick is locked in.\n\n` +
          `You get ${span} free with every feature switched on. No card, and nothing happens automatically when it ends.`
        : `A few days ago you created a ${name} account and stopped before setting up your fleet. ` +
          `If something put you off — the questions, the pricing, not enough time — just reply and tell us; a real person reads every reply.\n\n` +
          `If you'd rather see it first, we can walk you through it on a 15-minute call and set your fleet up with you. ` +
          `Your ${span} free starts only when you create the fleet.`;
    actionUrl = `${base}/onboarding`;
    actionLabel = 'Finish setting up';
    footnote =
      input.round === 1
        ? `You're getting this because you created a ${name} account and haven't set up a fleet yet.`
        : `This is the last reminder about your unfinished ${name} account — we won't email about it again.`;
  }

  const showDemo = input.stage === 'no_fleet' && input.round === 2;
  const html = renderBrandedEmail({
    heading: subject,
    greeting: 'Hi there,',
    preheader: input.stage === 'unverified' ? 'Sign in and we’ll send a fresh code.' : `About a minute left — ${span} free, no card.`,
    body,
    actionUrl,
    actionLabel,
    ...(showDemo ? { secondaryActionUrl: demoUrl, secondaryActionLabel: 'Book a walkthrough' } : {}),
    showLinkFallback: false,
    footnote,
  });

  const text = [subject, '', 'Hi there,', '', body, '', `${actionLabel}: ${actionUrl}`, showDemo ? `Book a walkthrough: ${demoUrl}` : '', '', footnote]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n');

  return { subject, html, text };
}

/** Send the reminder. Never throws; returns whether Resend accepted it. */
export async function sendSignupReminderEmail(input: SignupReminderInput): Promise<boolean> {
  try {
    const { subject, html, text } = buildSignupReminderEmail(input);
    return await sendEmail({ to: input.to, subject, html, text, replyTo: inbox() });
  } catch (err) {
    console.error('sendSignupReminderEmail failed:', err);
    return false;
  }
}
