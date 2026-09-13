// =============================================================================
// "NEED A HAND?" EMAIL — sent once to a fleet admin who hasn't signed in for
// 7 days. Friendly check-in, tailored to how far they got with setup.
// =============================================================================
// Sent by app/api/cron/inactivity (daily). Best-effort: failures are logged.
// =============================================================================

import { appName, emailBlocks, renderBrandedEmail, sendEmail } from '@/lib/email';
import { appUrl } from '@/lib/urls';

export interface InactivityEmailInput {
  to: string;
  fullName?: string | null;
  fleetName: string;
  /** Days since the admin last signed in. */
  daysAway: number;
  /** Setup progress, used to point at the most useful next step. */
  vehicles: number;
  drivers: number;
  settlements: number;
  onTrial: boolean;
  /** Days left on the trial (0 when not on trial). */
  trialDaysLeft: number;
}

export function buildInactivityEmail(input: InactivityEmailInput): { subject: string; html: string; text: string } {
  const name = appName();
  const base = appUrl();
  const url = (p: string) => `${base}${p}`;
  const first = input.fullName?.trim().split(/\s+/)[0];

  // The one thing that would move them forward, based on where they stopped.
  const nextStep =
    input.vehicles === 0
      ? { title: 'Add your first vehicle', description: 'Plate, make and model is enough to start — documents and service reminders can follow.', href: url('/fleet/vehicles/new') }
      : input.drivers === 0
        ? { title: 'Invite a driver', description: 'They get the free app for shifts and live location; you see everything from the dashboard.', href: url('/fleet/drivers/new') }
        : input.settlements === 0
          ? { title: 'Run your first driver settlement', description: 'The 2-minute wizard sets your pay rules once; every week after that is automatic.', href: url('/fleet/settlements/setup') }
          : { title: 'Pick up where you left off', description: 'Your fleet, drivers and pay are all set up — the dashboard is waiting.', href: url('/fleet') };

  const helpOptions = [
    { title: 'Reply to this email', description: 'Tell us what got in the way. A real person reads every reply, usually the same day.', href: `mailto:${process.env.CONTACT_INBOX || 'hello@rovora.eu'}` },
    { title: 'Book a 15-minute walkthrough', description: 'We share our screen and set up your fleet with you, live.', href: url('/contact?topic=onboarding') },
    { title: 'Send us your spreadsheet', description: "If your vehicles and drivers live in Excel today, we'll import them for you.", href: url('/contact?topic=import') },
  ];

  const trialLine =
    input.onTrial && input.trialDaysLeft > 0
      ? emailBlocks.callout(
          `${input.trialDaysLeft} day${input.trialDaysLeft === 1 ? '' : 's'} left on your free trial.`,
          'No card is needed and nothing happens automatically when it ends — you just choose a plan if you want to keep going.',
        )
      : '';

  const sectionsHtml =
    emailBlocks.sectionTitle('The quickest next step') +
    emailBlocks.numberedSteps([nextStep]) +
    emailBlocks.sectionTitle('Or let us do it with you') +
    emailBlocks.linkList(helpOptions) +
    trialLine;

  const heading = `Need a hand with ${input.fleetName}?`;
  const body =
    `It's been about a week since you were last in ${name}, and we wanted to check in. ` +
    `Most operators tell us the first setup is the only hard part — after that it runs itself.\n\n` +
    `If something was confusing, missing, or just not worth the time, we'd genuinely like to know. ` +
    `And if you're simply busy, that's fine too — your fleet is exactly as you left it.`;

  const html = renderBrandedEmail({
    heading,
    greeting: first ? `Hi ${first},` : 'Hi there,',
    preheader: `Quick check-in from ${name}: stuck on anything, or just busy?`,
    body,
    sectionsHtml,
    actionUrl: nextStep.href,
    actionLabel: nextStep.title,
    secondaryActionUrl: url('/contact?topic=onboarding'),
    secondaryActionLabel: 'Book a walkthrough',
    showLinkFallback: false,
    footnote:
      `You're getting this once because you set up "${input.fleetName}" on ${name} and haven't signed in for ${input.daysAway} days. ` +
      `Not the right time? Just reply "not now" and we won't check in again.`,
  });

  const text = [
    heading,
    '',
    first ? `Hi ${first},` : 'Hi there,',
    '',
    body.replace(/\n\n/g, '\n'),
    '',
    `NEXT STEP: ${nextStep.title} - ${nextStep.description} ${nextStep.href}`,
    '',
    'OR LET US DO IT WITH YOU',
    ...helpOptions.map((h) => `- ${h.title}: ${h.href}`),
    '',
    input.onTrial && input.trialDaysLeft > 0 ? `${input.trialDaysLeft} days left on your free trial. No card needed.` : '',
    `Reply "not now" and we won't check in again.`,
  ].filter((l) => l !== undefined).join('\n');

  return { subject: heading, html, text };
}

/** Send the check-in. Never throws; returns whether Resend accepted it. */
export async function sendInactivityEmail(input: InactivityEmailInput): Promise<boolean> {
  try {
    const { subject, html, text } = buildInactivityEmail(input);
    return await sendEmail({
      to: input.to,
      subject,
      html,
      text,
      replyTo: process.env.CONTACT_INBOX || 'hello@rovora.eu',
    });
  } catch (err) {
    console.error('sendInactivityEmail failed:', err);
    return false;
  }
}
