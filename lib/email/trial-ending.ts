// =============================================================================
// TRIAL ENDING / ENDED EMAILS — to fleet admins on the free trial.
// =============================================================================
// Until now the only warning was the countdown strip inside the dashboard,
// which nobody sees if they haven't signed in lately. The first a fleet heard
// of the end was the dashboard locking behind the Billing page.
//
//   ending  ~3 days before the free period ends
//   ended   the first day or two after it ended (dashboard now locked)
//
// Each is sent once per admin per fleet (lifecycle_emails). Says only what is
// true: the dashboard locks until a plan is chosen, nothing is charged
// automatically, and the fleet's data stays as it is.
// Sent by app/api/cron/trial-ending. Best-effort: failures are logged.
// =============================================================================

import { appName, emailBlocks, renderBrandedEmail, sendEmail } from '@/lib/email';
import { appUrl } from '@/lib/urls';

export interface TrialEmailInput {
  to: string;
  fullName?: string | null;
  fleetName: string;
  stage: 'ending' | 'ended';
  /** When the free period ends / ended (ISO). */
  endsAt: string;
  vehicles: number;
  drivers: number;
  /** The plan that fits the fleet's current size, if the catalogue has one. */
  plan: { name: string; price: string; custom: boolean } | null;
}

const inbox = () => process.env.CONTACT_INBOX || 'hello@rovora.eu';
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function buildTrialEmail(input: TrialEmailInput): { subject: string; html: string; text: string } {
  const name = appName();
  const base = appUrl();
  const first = input.fullName?.trim().split(/\s+/)[0];
  const date = new Date(input.endsAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Malta' });
  const setUp = input.vehicles > 0 || input.drivers > 0;
  const fleetLine = setUp
    ? `${input.fleetName} has ${plural(input.vehicles, 'vehicle')} and ${plural(input.drivers, 'driver')} set up`
    : null;
  const planLine = input.plan
    ? input.plan.custom
      ? `For a fleet your size that's our ${input.plan.name} plan, priced with you — reply and we'll sort it out.`
      : `For a fleet your size that's ${input.plan.name}, at ${input.plan.price}.`
    : '';

  let subject: string;
  let body: string;
  if (input.stage === 'ending') {
    subject = `Your free ${name} trial ends on ${date}`;
    body =
      `Your free period for ${input.fleetName} ends on ${date}. ` +
      (fleetLine ? `${fleetLine} — choose a plan before then and everything keeps running without a break. ` : `Choose a plan before then to keep using ${name}. `) +
      `${planLine}\n\n` +
      `Nothing is charged automatically: if you don't choose a plan, the dashboard simply pauses until you do, and your data stays exactly as it is.`;
  } else {
    subject = `Your ${name} trial has ended — your data is safe`;
    body =
      `The free period for ${input.fleetName} ended on ${date}, so the dashboard is paused until a plan is chosen. ` +
      `${fleetLine ? `${fleetLine}, and all of it is kept exactly as it was. ` : 'Everything you added is kept exactly as it was. '}` +
      `${planLine}\n\n` +
      `Choose a plan and you'll pick up right where you left off. Nothing was charged.`;
  }

  const help = [
    { title: 'Compare plans', description: 'Every plan, with what it includes and costs.', href: `${base}/pricing` },
    { title: 'Not sure yet? Tell us', description: 'Reply to this email — a real person reads every one, usually the same day.', href: `mailto:${inbox()}` },
  ];

  const html = renderBrandedEmail({
    heading: subject,
    greeting: first ? `Hi ${first},` : 'Hi there,',
    preheader: input.stage === 'ending' ? `Choose a plan before ${date} to keep ${input.fleetName} running.` : 'Choose a plan to pick up where you left off. Nothing was charged.',
    body,
    sectionsHtml: emailBlocks.linkList(help),
    actionUrl: `${base}/billing`,
    actionLabel: 'Choose a plan',
    showLinkFallback: false,
    footnote: `You're getting this because you're an admin of ${input.fleetName} on ${name}, which is on the free trial.`,
  });

  const text = [
    subject, '', first ? `Hi ${first},` : 'Hi there,', '', body.replace(/\n\n/g, '\n\n'), '',
    `Choose a plan: ${base}/billing`, `Compare plans: ${base}/pricing`, '',
    `You're getting this because you're an admin of ${input.fleetName} on ${name}, which is on the free trial.`,
  ].join('\n');

  return { subject, html, text };
}

/** Send it. Never throws; returns whether Resend accepted it. */
export async function sendTrialEmail(input: TrialEmailInput): Promise<boolean> {
  try {
    const { subject, html, text } = buildTrialEmail(input);
    return await sendEmail({ to: input.to, subject, html, text, replyTo: inbox() });
  } catch (err) {
    console.error('sendTrialEmail failed:', err);
    return false;
  }
}
