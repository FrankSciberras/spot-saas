import type { TrialCopy } from '@/lib/billing/trial-offer';

export interface FaqItem {
  q: string;
  a: string;
}

/**
 * Homepage FAQ ("A few things before you start") — rendered on the homepage and
 * reused for its FAQPage JSON-LD. Takes the live trial copy so the answer about
 * the free trial always matches the offer that's running.
 */
export function homeFaq(trial: TrialCopy): FaqItem[] {
  return [
    {
      q: 'What happens after the free trial?',
      a: `The current offer gives you ${trial.span} to try Rovora without entering a card. Choose a paid plan if you want to continue. Nothing is charged when the trial ends.`,
    },
    {
      q: 'Can I bring my existing fleet records?',
      a: 'Yes. Add your vehicles and drivers yourself, or use the assisted data import included with Fleet. Contact the team about your current records before moving over.',
    },
    {
      q: 'How do drivers get the app?',
      a: 'You invite each driver from your dashboard. Android drivers download the Rovora app from Google Play and sign in. iPhone drivers sign in at rovora.eu in Safari for now; a native iPhone app is on the roadmap. Managers never need the app: the dashboard runs in any browser.',
    },
    {
      q: 'Are all integrations live connections?',
      a: 'No. Supported services such as Bolt and Traccar connect directly. Xero and QuickBooks use CSV exports that you import into those tools. See the integrations page for the exact capabilities.',
    },
  ];
}

/** The longer FAQ on /pricing — rendered there and reused for its FAQPage JSON-LD. */
export const PRICING_FAQ: FaqItem[] = [
  {
    q: 'How long does it take to get set up?',
    a: "Most fleets are live in an afternoon. Add your vehicles and drivers, invite the team to the driver app, and you're running shifts the same day. On the Fleet plan we'll import your existing data for you.",
  },
  {
    q: 'Do my drivers need to install anything?',
    a: 'Drivers use the free Rovora driver app to clock in, log shifts and see their earnings. It takes a couple of minutes to set up and needs no training — if they can use a ride-hail app, they can use Rovora.',
  },
  {
    q: 'Do I need to buy GPS trackers for my cars?',
    a: "No. Rovora's live map works through the free driver app on the phone your driver already carries — no hardware to buy, install or maintain, and no SIM contracts. Drivers share their location with one tap when a shift starts, you see the whole fleet live, and tracking stops when they stop. For a 10-car fleet that's typically €1,000+ saved up front versus dedicated trackers. Already have trackers? Connect Wialon, Traccar, flespi, Navixy, Samsara, Geotab or Mapon and tick Drivers, Cars or both on the same map.",
  },
  {
    q: 'Can I move over my current vehicles and drivers?',
    a: "Yes. You can add everything manually in minutes, or send us a spreadsheet and we'll import your vehicles, drivers and documents so nothing gets left behind.",
  },
  {
    q: 'How do driver settlements and payouts work?',
    a: "Rovora reconciles each driver's week automatically — gross splits, fees, cash drops, tips and any adjustments — then produces a clean, payable amount. You review, approve and run payouts in a single pass, with a PDF statement for your records.",
  },
  {
    q: 'Is my fleet data secure?',
    a: 'Your data is encrypted in transit and at rest, hosted in the EU, and only ever visible to your team. You can export everything at any time, and we never sell or share your data.',
  },
  {
    q: 'What if I run more than 75 vehicles?',
    a: "Up to 75 vehicles you're self-serve on the Fleet plan, priced by the car. Above that, our Enterprise plan adds custom volume pricing, white-glove onboarding and a dedicated account manager — get in touch and we'll tailor it to your operation.",
  },
];
