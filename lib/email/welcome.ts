// =============================================================================
// WELCOME EMAIL — sent once, right after an operator creates their fleet
// =============================================================================
// Best-effort: failures are logged and never block onboarding.
// =============================================================================

import { appName, emailBlocks, renderBrandedEmail, sendEmail } from '@/lib/email';
import { appUrl } from '@/lib/urls';

export interface WelcomeEmailInput {
  to: string;
  /** Operator's full name, if we have one. */
  fullName?: string | null;
  fleetName: string;
  /** True when the fleet starts on the free trial (the default path). */
  onTrial: boolean;
}

export function buildWelcomeEmail(input: WelcomeEmailInput): { subject: string; html: string; text: string } {
  const name = appName();
  const base = appUrl();
  const url = (p: string) => `${base}${p}`;
  const first = input.fullName?.trim().split(/\s+/)[0];

  const steps = [
    {
      title: 'Add your vehicles',
      description: 'Plates, documents and service intervals — reminders switch on automatically.',
      href: url('/fleet/vehicles/new'),
    },
    {
      title: 'Invite your drivers',
      description: 'Each driver gets their own login and the mobile app for shifts and tracking.',
      href: url('/fleet/drivers/new'),
    },
    {
      title: 'Set up driver pay',
      description: 'A 2-minute guided wizard builds your settlement rules: splits, tips, rent, tax.',
      href: url('/fleet/settlements/setup'),
    },
    {
      title: 'Turn tools on or off',
      description: 'Bookkeeping, rosters, live tracking, maintenance, parts — enable only what you need.',
      href: url('/fleet/integrations'),
    },
  ];

  const guides = [
    {
      title: 'How to run a taxi fleet',
      description: 'Our end-to-end playbook, from onboarding drivers to weekly payouts.',
      href: url('/blog/how-to-run-a-taxi-fleet'),
    },
    {
      title: 'Driver settlements explained',
      description: 'How platform earnings, commissions, tips and deductions add up to a payslip.',
      href: url('/blog/driver-settlements-explained'),
    },
    {
      title: 'Live tracking without GPS hardware',
      description: 'Use the driver app for location, trips, stops and safety scores.',
      href: url('/blog/fleet-tracking-without-gps-hardware'),
    },
    {
      title: 'Plans & billing',
      description: 'See what each plan includes and manage your subscription at any time.',
      href: url('/fleet/billing'),
    },
    {
      title: "What's new",
      description: 'Every improvement we ship, in one timeline.',
      href: url('/changelog'),
    },
  ];

  const sectionsHtml =
    (input.onTrial
      ? emailBlocks.callout(
          'Your 30-day free trial is live.',
          'Every feature is unlocked and no card is needed. Pick a plan whenever you are ready from Billing.',
        )
      : '') +
    emailBlocks.sectionTitle('Get set up in four steps') +
    emailBlocks.numberedSteps(steps) +
    emailBlocks.sectionTitle('Guides & resources') +
    emailBlocks.linkList(guides);

  const heading = `Welcome to ${name} — ${input.fleetName} is ready`;
  const body =
    `Your fleet "${input.fleetName}" has been created and you're its admin. ` +
    `${name} brings drivers, vehicles, pay, bookkeeping and tracking into one place, so you can stop juggling spreadsheets and group chats.\n\n` +
    `Here's the quickest way to get value in your first week:`;

  const html = renderBrandedEmail({
    heading,
    greeting: first ? `Hi ${first},` : 'Hi there,',
    preheader: `${input.fleetName} is set up. Here's how to get going in your first week.`,
    body,
    sectionsHtml,
    actionUrl: url('/fleet'),
    actionLabel: 'Open your fleet',
    secondaryActionUrl: url('/contact'),
    secondaryActionLabel: 'Contact us',
    showLinkFallback: false,
    footnote: `Questions or stuck on something? Reply to this email or use the Contact us button — a real person answers. You received this because you created a fleet on ${name}.`,
  });

  const text = [
    heading,
    '',
    first ? `Hi ${first},` : 'Hi there,',
    '',
    body.replace(/\n\n/g, '\n'),
    '',
    'GET SET UP',
    ...steps.map((s, i) => `${i + 1}. ${s.title} - ${s.description} ${s.href}`),
    '',
    'GUIDES',
    ...guides.map((g) => `- ${g.title}: ${g.href}`),
    '',
    `Open your fleet: ${url('/fleet')}`,
    `Contact us: ${url('/contact')}`,
  ].join('\n');

  return { subject: heading, html, text };
}

/** Send the welcome email. Never throws; returns whether Resend accepted it. */
export async function sendWelcomeEmail(input: WelcomeEmailInput): Promise<boolean> {
  try {
    const { subject, html, text } = buildWelcomeEmail(input);
    return await sendEmail({
      to: input.to,
      subject,
      html,
      text,
      replyTo: process.env.CONTACT_INBOX || 'hello@rovora.eu',
    });
  } catch (err) {
    console.error('sendWelcomeEmail failed:', err);
    return false;
  }
}
