import type { FeatureExtra } from './types';

/**
 * "Who it's for", FAQ and related links for the eight hand-written
 * /features/* pages, keyed by slug.
 *
 * Every answer here was checked against the product as it is in `main`.
 * Before changing one, check the code or the changelog — and when a feature
 * changes, update its answers here in the same PR. Things deliberately NOT
 * claimed because the code does not do them today: paying drivers' bank
 * accounts, auto-filling settlements from Bolt, a live Uber connection,
 * service/repair costs flowing into the books on their own, an audit-log
 * entry per adjustment, roster clash detection, and anything about meeting a
 * regulator's tracking-device rule.
 */
export const FEATURE_EXTRAS: Record<string, FeatureExtra> = {
  vehicles: {
    audienceTitle: 'Who uses vehicle management',
    audience: [
      {
        who: 'Owners who do everything themselves',
        situation:
          'The insurance dates are in a folder, the mileage is in the driver’s head and the road licence renewal is a note on your phone.',
        gets: 'One record per car with its dates, drivers, mileage and history, and a warning before anything expires.',
      },
      {
        who: 'Office staff and dispatchers',
        situation: 'You need to know which cars can go out today and who normally drives each one.',
        gets: 'Each car’s status (active, in service or out of service), its assigned drivers and its last odometer reading on one screen.',
      },
      {
        who: 'Fleets growing past ten cars',
        situation: 'At five cars you knew every renewal date by heart. At fifteen you don’t.',
        gets: 'Expiry alerts by notification, push and email, so the list of dates no longer depends on one person’s memory.',
      },
    ],
    faq: [
      {
        q: 'What does Rovora keep for each vehicle?',
        a: 'Registration, make, model, year and colour, its status (active, in service or out of service), the drivers assigned to it, its current mileage, its insurance and road licence expiry dates, uploaded documents, and its service and damage history. Everything sits on one page per car.',
      },
      {
        q: 'How does Rovora know a car’s mileage?',
        a: 'The driver types the odometer reading when they start a shift, and the car’s record is updated with it. A reading lower than the last one is refused, so a typo can’t wind the mileage back. Rovora does not plug into the car, so the figure is as current as the last shift.',
      },
      {
        q: 'Will I be warned before insurance or the road licence runs out?',
        a: 'Yes. Each car has an insurance expiry date and a road licence expiry date, and you are alerted ahead of time — 30 days by default — in the dashboard, by push and by email. Other paperwork can be uploaded with its own expiry date. The full set of document-expiry alerts is on the Pro plan and above.',
      },
      {
        q: 'Can more than one driver use the same car?',
        a: 'Yes. A car can have several drivers assigned and a driver can have several cars. When a driver goes online they pick which of their cars they are taking out.',
      },
      {
        q: 'Do I have to type every vehicle in by hand?',
        a: 'No. You can add cars one at a time, or send us your spreadsheet and we import it. On the Fleet plan the import is done for you as part of onboarding.',
      },
    ],
    related: ['/features/maintenance', '/features/damage', '/for/small-fleets'],
  },

  maintenance: {
    audienceTitle: 'Who uses maintenance tracking',
    audience: [
      {
        who: 'Owners watching the service intervals',
        situation: 'A cab covers a private car’s yearly mileage in a few months, so a service comes round faster than the calendar suggests.',
        gets: 'A next-service target in kilometres or by date on every car, checked against the odometer each time a driver starts a shift.',
      },
      {
        who: 'Whoever books the garage',
        situation: 'You find out a car is overdue when the driver mentions a noise.',
        gets: 'An alert when a car is close to its service, with enough notice to book it for a quiet day.',
      },
      {
        who: 'Your accountant, and you at resale',
        situation: 'Service invoices are scattered across email, paper and the garage’s own records.',
        gets: 'A dated list per car of what was done, by whom, at what mileage and what it cost.',
      },
    ],
    faq: [
      {
        q: 'How does Rovora know when a service is due?',
        a: 'When you log a service you set when the next one is due — at a mileage, on a date, or both. Rovora compares that with the odometer reading drivers enter at the start of each shift and with today’s date, and marks the car as due soon or overdue.',
      },
      {
        q: 'What happens if a driver takes out a car that is due for a service?',
        a: 'The check runs when the driver starts the shift and enters the odometer. If the car has reached its service mileage, you get an alert. You decide what to do next; the car’s record shows it as due until a new service is logged.',
      },
      {
        q: 'Can I schedule by date as well as by kilometres?',
        a: 'Yes. Each service record can carry a next-due mileage, a next-due date, or both, and date-based ones alert you ahead of time. That covers things that follow the calendar, such as an inspection, as well as oil changes that follow the odometer.',
      },
      {
        q: 'Can I record what each service cost and who did it?',
        a: 'Yes. Every record holds the type of work (oil change, tyres, brakes, full service, inspection, repair or other), the date, the mileage, the garage, the cost and your notes. The cost stays on the car’s service history; to count it in your books as well, add it as a bookkeeping expense tagged to that vehicle.',
      },
      {
        q: 'Does Rovora read fault codes or the car’s own service indicator?',
        a: 'No. Rovora does not connect to the car’s computer and needs no device fitted. It works from the odometer readings your drivers enter and the service records you log.',
      },
    ],
    related: ['/features/vehicles', '/features/damage', '/features/bookkeeping'],
  },

  damage: {
    audienceTitle: 'Who uses damage reports',
    audience: [
      {
        who: 'Owners with cars shared between drivers',
        situation: 'A scratch appears on a car that three people drove this week and nobody remembers it.',
        gets: 'Dated photos of the car from the start of each shift, to compare against the day the damage was found.',
      },
      {
        who: 'Office staff logging repairs',
        situation: 'Damage is reported by a photo in a group chat and then scrolls out of sight.',
        gets: 'A record per incident with the exact spot on the car, how bad it is, photos, a status and what the repair cost.',
      },
      {
        who: 'Drivers',
        situation: 'You pick up a car that already has a dent and don’t want it put on you.',
        gets: 'A place to photograph existing scratches before you go online, with the time recorded.',
      },
    ],
    faq: [
      {
        q: 'How do I log damage on a car?',
        a: 'Open the car, tap the damaged area on its diagram — bumpers, doors, sides and each wheel rim are separate zones — then set the severity (minor, moderate or severe), describe it and attach photos. The record stays on that vehicle’s history.',
      },
      {
        q: 'Can drivers report damage from their phone?',
        a: 'Drivers photograph the car when they start a shift and can add extra photos of any scratches they notice. The damage record itself — zone, severity, repair cost — is created by an admin or office staff in the dashboard.',
      },
      {
        q: 'How do I work out whose shift the damage happened on?',
        a: 'Compare the damage report’s date with the photos drivers took at the start of their shifts on that car. If the mark is missing from one shift’s photos and present on the next, you know when it appeared. Rovora gives you the evidence; it does not assign blame automatically.',
      },
      {
        q: 'Can I track repair costs?',
        a: 'Yes. Each incident has a status — open, monitoring or repaired — a repair cost and the date it was fixed, so you can see what a car has cost you in bodywork. To recover an excess from a driver, add it as a deduction and it comes off their next settlement.',
      },
      {
        q: 'Does Rovora handle the insurance claim?',
        a: 'No. Rovora keeps the photos, dates and costs you would hand to your insurer or garage, but it does not file claims or talk to insurers for you.',
      },
    ],
    related: ['/features/vehicles', '/features/adjustments', '/features/driver-app'],
  },

  'live-tracking': {
    audienceTitle: 'Who uses live tracking',
    audience: [
      {
        who: 'Owners who aren’t at a desk',
        situation: 'You want to know who is working right now without ringing round.',
        gets: 'A live map on your phone or laptop showing every driver on shift, and a list of anyone on shift who isn’t showing.',
      },
      {
        who: 'Dispatchers and office staff',
        situation: 'A customer or a hotel asks where the car is, or a driver says they were somewhere they weren’t.',
        gets: 'Live positions and speed, plus a day-by-day history of each driver’s trips and stops to check afterwards.',
      },
      {
        who: 'Fleets worried about how their cars are driven',
        situation: 'You hear about harsh driving from a passenger complaint or a repair bill.',
        gets: 'Speeding, harsh braking, acceleration and cornering events per driver, on a map, with a weekly safety score.',
      },
    ],
    faq: [
      {
        q: 'Do I need to buy GPS trackers?',
        a: 'No. The map runs from the Rovora Driver app on the phone each driver already carries, so there is nothing to fit to the car and no SIM contract. If you already have hardware trackers, connections to Wialon, Traccar, flespi and Teltonika are on the roadmap but not live yet.',
      },
      {
        q: 'Does phone tracking satisfy a regulator’s tracking-device requirement?',
        a: 'We make no claim that it does. Rovora shows where a driver’s phone is during a shift; it is not a device fitted to the vehicle. If your licence requires a tracking device in the car, check the rule with your regulator and treat Rovora as the tool for running your operation, not as that device.',
      },
      {
        q: 'Are drivers tracked when they are off shift?',
        a: 'No. Location sharing starts when a driver starts a shift and stops when the shift ends. You can also switch “Live location during shifts” off for the whole fleet in Settings.',
      },
      {
        q: 'What happens if a driver switches location off or the phone stops sharing?',
        a: 'The Live Map lists every on-shift driver it can’t see, with the specific reason — location only allowed while the app is open, sharing turned off, using the website instead of the app — and what to tell them. The app restarts sharing by itself if the phone stopped it, and keeps reminding the driver. You can also require working location access before a shift can start.',
      },
      {
        q: 'Which phones does it work on, and which plan do I need?',
        a: 'Rovora Driver is on Google Play for Android; an iPhone app is on the roadmap. Every plan includes the live map. Zones, speed and speeding alerts, route playback and lost-signal alerts are on the Pro plan and above — see pricing for the details.',
      },
    ],
    related: ['/features/safety', '/features/driver-app', '/features/rosters'],
  },

  rosters: {
    audienceTitle: 'Who uses rosters',
    audience: [
      {
        who: 'Owners planning the week on Sunday night',
        situation: 'The roster is a spreadsheet screenshot sent to a group chat, and then re-sent every time it changes.',
        gets: 'A grid of cars against days that you fill in once and publish to every driver in one click.',
      },
      {
        who: 'Fleets where two drivers share a car',
        situation: 'One car, a day driver and a night driver, and a handover nobody wrote down.',
        gets: 'A second driver slot on any car and day, so both drivers see the same plan.',
      },
      {
        who: 'Drivers',
        situation: 'You scroll back through a chat to find out whether you are working on Thursday.',
        gets: 'Your own days and cars in the driver app, with a notification when the roster is published or changed.',
      },
    ],
    faq: [
      {
        q: 'How do I build a roster?',
        a: 'Create a roster for the week and you get a grid with your cars down the side and the days across the top. Pick the driver for each car and day, and add a second driver where two people share a car. It stays a draft until you publish it.',
      },
      {
        q: 'How do drivers find out about their shifts?',
        a: 'When you publish, every driver on the roster gets a notification in Rovora, a push notification and an email, and the roster appears in their driver app. They only see published rosters, never your drafts.',
      },
      {
        q: 'What happens when the plan changes mid-week?',
        a: 'Edit the roster and press “Republish & Notify”. The drivers on that roster are told it has been updated and see the new version in the app. The notification says the roster changed; it does not list the individual changes.',
      },
      {
        q: 'Do I have to start from a blank grid every week?',
        a: 'No. Duplicate last week’s roster and adjust the days that differ. Most fleets’ weeks look much alike, so this takes a couple of minutes.',
      },
      {
        q: 'Can Rovora build the roster for me, or let drivers swap shifts?',
        a: 'No. You decide who drives which car on which day; Rovora does not auto-schedule and drivers cannot swap shifts between themselves in the app. A roster is planned by day, not by start and finish time.',
      },
    ],
    related: ['/features/driver-app', '/features/messages', '/features/live-tracking'],
  },

  settlements: {
    audienceTitle: 'Who uses settlements',
    audience: [
      {
        who: 'Owners doing driver pay on a Sunday',
        situation: 'You copy each driver’s Bolt and Uber figures into a spreadsheet, apply the split, take off cash and tax, and hope the formula is still right.',
        gets: 'The same sums done for every driver from the figures you enter or import, with one amount owed per driver.',
      },
      {
        who: 'Your accountant',
        situation: 'They receive screenshots and a spreadsheet with a different layout each month.',
        gets: 'A PDF statement per driver for the week or the month, itemised the same way every time.',
      },
      {
        who: 'Drivers',
        situation: 'You get a bank transfer and a number, and no way to see how it was worked out.',
        gets: 'Your own finalised statements in the driver app — fares, fees, tips, cash, tax, adjustments and what you are owed.',
      },
    ],
    faq: [
      {
        q: 'Where do the earnings figures come from?',
        a: 'You type each driver’s gross fares, tips, cash rides and campaign bonuses per platform, or import the CSV you download from the platform’s fleet portal: choose the platform, drop the file in, confirm which column is which, and Rovora matches the rows to your drivers. A live Uber connection is on the roadmap, and the Bolt connection shows rides and fares but does not fill in settlements, because Bolt does not share commission or payout figures yet.',
      },
      {
        q: 'Does Rovora pay my drivers?',
        a: 'No. Rovora works out what each driver is owed; you pay them the way you do now — bank transfer or cash — and mark the settlement as paid, one at a time or the whole week together. Paying drivers out through Stripe is on the roadmap.',
      },
      {
        q: 'How is cash handled?',
        a: 'You tell Rovora once whether your drivers keep the cash fares they collect or hand them in. If they keep it, cash is deducted from what you owe them; if they hand it in, it isn’t.',
      },
      {
        q: 'Can I settle monthly, or for a period that isn’t exactly a week?',
        a: 'Yes. A settlement can cover any date range. Weekly rent, a fixed weekly wage and flat weekly tax are scaled to the length of the period, and you are told when that happens. The month PDF shows what each driver earned, what has already been paid and what is still owed.',
      },
      {
        q: 'Which platforms does it support, and which plan do I need?',
        a: 'Bolt, Uber and eCabs are there from the start, and you can add others, such as your own direct work. Each platform has its own fee percentage and is tracked separately. Driver settlements are on the Pro plan and above — see pricing.',
      },
    ],
    related: ['/features/flexible-pay', '/features/adjustments', '/features/bolt'],
  },

  'flexible-pay': {
    audienceTitle: 'Who uses flexible pay',
    audience: [
      {
        who: 'Fleets on a revenue split',
        situation: 'Most drivers are on 50/50, two long-standing ones are on 60/40, and the difference lives in a spreadsheet formula.',
        gets: 'A fleet default plus a per-driver override, applied to every settlement without anyone remembering who is on what.',
      },
      {
        who: 'Fleets that rent cars to drivers',
        situation: 'The driver keeps the fares and pays you a weekly rent for the car.',
        gets: 'A weekly rent line that is deducted in every settlement and scaled when the period is longer than a week.',
      },
      {
        who: 'Fleets with employed drivers',
        situation: 'Some drivers are on an hourly rate or a fixed weekly wage rather than a share of fares.',
        gets: 'Hourly and fixed-wage lines in the same settlement, with or without a revenue share on top.',
      },
    ],
    faq: [
      {
        q: 'Can each driver have a different split?',
        a: 'Yes. Set a fleet default, then override it for any driver: their share of fares, of tips, of campaign bonuses, and how much of the platform fee they carry. Anything you leave blank on a driver follows the fleet default.',
      },
      {
        q: 'What can I include in a driver’s pay?',
        a: 'Nine lines, each of which you can switch on or off: the driver’s share of fares, platform fees, cash collected, tips, campaign bonuses, an hourly wage, a fixed weekly wage, tax and weekly vehicle rent. A saved combination is a pay preset; use one for the whole fleet or give a driver their own.',
      },
      {
        q: 'How is FSS tax handled?',
        a: 'As a flat weekly amount or as a percentage of the driver’s balance before tax — your choice per preset. The flat amount is scaled when a settlement covers more than a week. You can change the figure on an individual settlement, and Rovora does not file anything with the tax authorities for you.',
      },
      {
        q: 'If I change a split, do old settlements change too?',
        a: 'No. The scheme in force is stored on each settlement when it is created, so past weeks keep the numbers they were worked out with. A change applies to settlements you create afterwards.',
      },
      {
        q: 'Is this full payroll software?',
        a: 'No. Rovora works out what each driver is owed under your arrangement and produces a statement. It does not produce statutory payslips, submit tax or social-security returns, or pay drivers; keep your accountant or payroll provider for those.',
      },
    ],
    related: ['/features/settlements', '/features/adjustments', '/for/bolt-uber-fleets'],
  },

  adjustments: {
    audienceTitle: 'Who uses adjustments',
    audience: [
      {
        who: 'Owners with one-off items every week',
        situation: 'A fuel bonus here, a parking fine there, and a note to yourself to take it off on Sunday.',
        gets: 'Somewhere to record it against the driver on the day it happens, so it is already in the settlement when you get there.',
      },
      {
        who: 'Fleets with standing weekly charges',
        situation: 'You take the same insurance contribution off every driver every week and re-type it each time.',
        gets: 'A recurring rule — a fixed amount or a percentage of gross — that adds itself to each new settlement.',
      },
      {
        who: 'Drivers',
        situation: 'Your pay is €40 lower than you expected and you don’t know why.',
        gets: 'Each adjustment shown as its own line with its description on your statement.',
      },
    ],
    faq: [
      {
        q: 'What kinds of adjustment can I add?',
        a: 'Bonuses and reimbursements, which add to what you owe the driver, and expenses and deductions, which come off it. There is also an “other” type for a note that should appear but not change the amount. Each has an amount, a date and a description.',
      },
      {
        q: 'Can I set up a deduction that repeats every week?',
        a: 'Yes. A recurring rule adds the adjustment to every new settlement for one driver or for the whole fleet, as a fixed amount or as a percentage of gross fares, from a start date until an optional end date. You can pause a rule without deleting it.',
      },
      {
        q: 'Can I spread a large deduction, such as a damage excess, over several weeks?',
        a: 'Yes, by using a recurring rule for the weekly instalment and giving it an end date. Rovora does not keep a running “amount left to recover” for you, so pick the end date to match the total.',
      },
      {
        q: 'If I edit a recurring rule, do past settlements change?',
        a: 'No. A rule creates a real adjustment on each settlement when that settlement is made, and from then on it belongs to that settlement. Changing or switching off the rule only affects settlements created afterwards.',
      },
      {
        q: 'Do drivers see their adjustments?',
        a: 'Yes. Adjustments are listed line by line on the settlement PDF and on the driver’s own statement in the app, with the description you wrote, so the reason travels with the number.',
      },
    ],
    related: ['/features/settlements', '/features/flexible-pay', '/features/damage'],
  },
};
