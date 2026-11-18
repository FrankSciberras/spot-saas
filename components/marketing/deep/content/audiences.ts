import type { DeepContent } from '../types';

const PARENT = { name: 'Who it’s for', path: '/#who' };

/* ───────────────────────── Bolt & Uber fleets ───────────────────────── */

export const FOR_BOLT_UBER: DeepContent = {
  path: '/for/bolt-uber-fleets',
  crumb: { parent: PARENT, name: 'Bolt & Uber fleets' },
  eyebrow: 'For Bolt, Uber & eCabs fleets',
  title: 'Fleet software for ride-hailing fleets,',
  accent: 'from Monday’s roster to Monday’s payout.',
  sub: 'You own the cars, your drivers earn on Bolt, Uber and eCabs, and every week you work out who is owed what. Rovora runs that week for you: who drives which car, what each car earned and cost, and one payable figure per driver.',
  proof: [
    'Weekly settlements per driver',
    'Bolt, Uber, eCabs and cash kept separate',
    'Bolt fleet account connects directly',
    'Live map from the driver’s phone',
  ],
  mock: {
    path: 'settlements',
    title: 'Settlements · week 46',
    pill: '7 of 9 finalised',
    rows: [
      { name: 'Joseph B.', meta: 'Bolt + Uber · 50% share', amt: '€412.60', st: 'Finalised' },
      { name: 'Maria C.', meta: 'Bolt + cash · rent €180', amt: '€268.15', st: 'Finalised' },
      { name: 'Karl M.', meta: 'eCabs · cash collected €240', amt: '−€36.40', st: 'Driver owes', idle: true },
      { name: 'Amount owed to drivers', meta: 'this week', amt: '€3,118.90' },
    ],
  },

  audienceTitle: 'Built for the way ride-hailing fleets are run',
  audience: [
    {
      who: 'Fleets paying drivers a share',
      situation:
        'Your drivers keep a percentage of what they bring in, less fees, cash they collected and tax. Every Monday that is a spreadsheet with a row per driver.',
      gets: 'Your split, set once. Each week Rovora applies it to what the driver earned and gives you one figure to pay.',
    },
    {
      who: 'Fleets renting cars to drivers',
      situation:
        'Drivers keep their earnings and pay you a weekly rent, plus whatever they owe for fuel, fines or damage.',
      gets: 'Rent, wages and flat tax as their own lines, scaled automatically when a week is shorter or longer than seven days.',
    },
    {
      who: 'Fleets on more than one platform',
      situation:
        'The same driver works Bolt in the morning and Uber at night, with a few cash jobs in between, and each platform reports differently.',
      gets: 'Each platform as its own line with its own fees and tips, so the totals add up and the driver can see why.',
    },
  ],

  painsTitle: 'Where the week goes',
  painsIntro: 'None of this is hard. It is just a lot of small jobs that all land on the same person.',
  pains: [
    {
      title: 'Sunday night belongs to the spreadsheet',
      body: 'Download each platform’s statement, copy the numbers across, apply the split, take off the cash, add the bonus you promised, and do it again for the next driver.',
    },
    {
      title: 'The roster is a screenshot in a group chat',
      body: 'The week is planned in Excel and sent as a picture. When it changes, a new picture goes out and half the drivers are looking at the old one.',
    },
    {
      title: 'A driver disputes the number',
      body: 'He remembers the week differently. You are scrolling back through a chat to find what was agreed about the fuel he paid for.',
    },
    {
      title: 'A document expires quietly',
      body: 'Insurance, road licence, a driver’s tag. The reminder was a note on your phone, and the car has been working uninsured since Thursday.',
    },
  ],

  stepsKicker: 'A week on Rovora',
  stepsTitle: 'What changes, day by day',
  stepsIntro: 'The same week you run now, with the copying and chasing taken out.',
  steps: [
    {
      title: 'Monday: publish the roster',
      body: 'Lay out the week on a grid of cars and days and publish it. Every driver gets a notification and sees their own days in the app. Change something and publish again, and they are told.',
    },
    {
      title: 'Every day: drivers start their own shifts',
      body: 'The driver picks the car, enters the odometer and confirms the pre-shift checks. You see who is on shift, in which car, and where they are on the live map, with nothing fitted to the vehicle.',
    },
    {
      title: 'During the week: costs go in as they happen',
      body: 'A fuel receipt, a car wash, a tyre. Add it from your phone in a few seconds with a photo, tagged to the car. A bonus or a deduction for a driver goes in as an adjustment against that driver and week.',
    },
    {
      title: 'Any time: check Bolt without opening Bolt',
      body: 'With your Bolt fleet account connected, each driver’s rides, fares, tips, acceptance and rating are in Rovora, refreshed every hour, together with which cars have gone idle.',
    },
    {
      title: 'Next Monday: run the settlement',
      body: 'Open the week, enter or import each driver’s earnings per platform, and Rovora applies your split, fees, tips, cash, tax, rent and that week’s adjustments. You get one figure per driver.',
    },
    {
      title: 'Pay, and send the proof',
      body: 'Finalise the week and export a PDF with a page per driver that leads with the amount owed. Pay them the way you do now, mark the week as paid, and the driver sees the same statement in their app.',
    },
  ],

  includedTitle: 'What a ride-hailing fleet uses most',
  included: [
    { icon: 'coins', title: 'Weekly settlements', body: 'Gross, platform fees, tips, campaigns, cash collected, tax, rent and wages, per driver, per week.' },
    { icon: 'sliders', title: 'Your pay scheme', body: 'A default split for the fleet and a different one for any driver who has their own deal.' },
    { icon: 'plusCircle', title: 'Adjustments', body: 'Bonuses, reimbursements, expenses and deductions, one-off or recurring, applied to the right week.' },
    { icon: 'bolt', title: 'Bolt connection', body: 'Rides, fares, tips and acceptance per driver from your Bolt fleet account, updated hourly.' },
    { icon: 'calendar', title: 'Rosters', body: 'The week on one grid, published to every driver’s phone.' },
    { icon: 'pulse', title: 'Live map', body: 'Who is on shift and where, from the driver’s phone. Shared during shifts only.' },
    { icon: 'car', title: 'Vehicles and documents', body: 'Insurance and road licence dates on every car, with a warning before they lapse.' },
    { icon: 'send', title: 'Messages', body: 'Chats, groups and announcements with your drivers, instead of the WhatsApp group.' },
    { icon: 'chart', title: 'Bookkeeping', body: 'What the fleet made and spent for any period, with an export for your accountant.' },
  ],

  limits: [
    {
      title: 'Earnings still come from the platform’s statement',
      body: 'You enter each driver’s weekly figures or import the CSV from the platform’s fleet portal. Bolt’s API does not share commission or payouts yet, so the Bolt connection shows rides and fares but does not fill in the settlement. A direct Uber connection is on the roadmap.',
    },
    {
      title: 'Rovora does not move the money',
      body: 'It works out what each driver is owed and records when you paid. The bank transfer or the cash handover is still yours. Paying out through Rovora is on the roadmap.',
    },
    {
      title: 'The live map is the driver’s phone, not a fitted device',
      body: 'Tracking runs in the Rovora Driver app during shifts. It is not a tracking device installed in the vehicle, so if your operator licence or a platform asks for one, you still need that device. Connecting hardware trackers to Rovora is on the roadmap.',
    },
    {
      title: 'It is not a dispatch system',
      body: 'Rides keep coming through Bolt, Uber, eCabs or your own desk. Rovora does not take bookings or assign jobs.',
    },
  ],

  faq: [
    {
      q: 'Does Rovora work for fleets on Bolt, Uber and eCabs at the same time?',
      a: 'Yes. Bolt, Uber and eCabs are set up as separate platforms from the start, and you can add your own. Each driver’s week is entered per platform, with its own fees and tips, and added together into one payable amount.',
    },
    {
      q: 'Can every driver have a different deal?',
      a: 'Yes. Set a default for the fleet, such as a 50% share, and override it for any driver. Rent, a fixed or hourly wage and tax can be switched on or off per scheme, and the scheme in force is saved with each settlement so past weeks never change.',
    },
    {
      q: 'How do cash fares work in the settlement?',
      a: 'You choose whether your drivers keep the cash they collect or hand it in. If they keep it, the cash is taken off what you owe them. A driver who collected more cash than their share shows as owing the fleet.',
    },
    {
      q: 'Do I have to type every driver’s earnings in by hand?',
      a: 'No. You can type them in on a spreadsheet-style entry screen, or import the CSV you download from the platform’s fleet portal and match the columns once. A fully automatic import from Uber is on the roadmap.',
    },
    {
      q: 'Does Rovora pay my drivers?',
      a: 'No. Rovora calculates the amount and keeps the record of what was paid and when. You pay drivers the way you already do, then mark the week as paid.',
    },
    {
      q: 'Do I need GPS trackers in the cars?',
      a: 'Not for Rovora. The live map, trip history and safety scores all run from the driver’s phone through the free app. If your licence separately requires a tracking device fitted to the vehicle, Rovora does not replace it.',
    },
    {
      q: 'How long does it take to move over?',
      a: 'Most fleets are set up in an afternoon: add your cars and drivers, set your split, publish a roster. If you send a spreadsheet of your drivers and vehicles, we can import it for you.',
    },
  ],
  related: ['/features/settlements', '/features/bolt', '/features/flexible-pay'],

  cta: {
    title: 'Run next week’s settlement in Rovora.',
    body: 'Get your {free} free, no card. Add your drivers this afternoon and settle your first week on Monday.',
  },
};

/* ───────────────────────── Small fleets ───────────────────────── */

export const FOR_SMALL: DeepContent = {
  path: '/for/small-fleets',
  crumb: { parent: PARENT, name: 'Small fleets' },
  eyebrow: 'For fleets of 2 to 10 cars',
  title: 'You run the fleet and do the paperwork.',
  accent: 'Rovora takes the paperwork.',
  sub: 'A handful of cars, a handful of drivers, and one person who plans the week, chases the documents, pays everybody and keeps the receipts. That person is you. Rovora is the office you do not have.',
  proof: [
    'Set up in an afternoon',
    'Works from your phone',
    'No trackers or hardware to buy',
    'Pay per vehicle, cancel any time',
  ],
  mock: {
    path: 'fleet',
    title: 'Today',
    pill: '4 of 6 cars on shift',
    rows: [
      { name: 'Car 2 · insurance', meta: 'expires in 9 days', st: 'Renew', idle: true },
      { name: 'Car 5 · service', meta: 'due in 640 km', st: 'Book', idle: true },
      { name: 'Joseph B.', meta: 'on shift 3h 12m · Car 4', st: 'On the map' },
      { name: 'This week', meta: 'income less expenses', amt: '€2,140' },
    ],
  },

  audienceTitle: 'Is this you?',
  audience: [
    {
      who: 'The owner who still drives',
      situation:
        'You are behind the wheel most days yourself. Anything that needs a laptop waits until late evening, if it happens at all.',
      gets: 'Everything works on a phone. A receipt, a roster change or a look at who is on shift takes seconds between jobs.',
    },
    {
      who: 'The owner who just added car number three',
      situation:
        'Two cars fitted in your head. With three, plus drivers who are not family, things have started to slip.',
      gets: 'One place where every car, driver, document date and week’s pay lives, so nothing depends on your memory.',
    },
    {
      who: 'The family fleet',
      situation:
        'A partner or a son does the books in the evening from photos you send during the day.',
      gets: 'One shared dashboard with as many logins as you need, so you are both looking at the same numbers.',
    },
  ],

  painsTitle: 'Small fleets do not fail on big things',
  painsIntro: 'They lose money on small ones that nobody had time to write down.',
  pains: [
    {
      title: 'A service that was due 3,000 km ago',
      body: 'The reminder was the sticker on the windscreen, and the driver did not mention it. Now it is a bigger bill.',
    },
    {
      title: 'A fine with no name on it',
      body: 'A ticket arrives for a Tuesday three weeks ago. Two people drove that car that day, and neither remembers.',
    },
    {
      title: 'Pay day takes the whole evening',
      body: 'Even with four drivers, working out each one’s share, cash and deductions by hand is a couple of hours every week.',
    },
    {
      title: 'You are the only one who knows',
      body: 'If you are ill for a week, nobody else can say which car is insured until when, or what anyone is owed.',
    },
  ],

  stepsKicker: 'Getting started',
  stepsTitle: 'From sign-up to a working fleet, in one afternoon',
  steps: [
    {
      title: 'Name your fleet',
      body: 'Sign-up is an email address and one screen. There is no card to enter and nothing to install.',
    },
    {
      title: 'Add your cars',
      body: 'Registration, make and model, current odometer, and the dates the insurance and road licence run out. Rovora starts counting down to each one.',
    },
    {
      title: 'Add your drivers',
      body: 'Each driver gets their own login to the free app. If they already have a Rovora account with another fleet, they get an invitation to accept.',
    },
    {
      title: 'Set a service interval',
      body: 'Tell Rovora how often each car is serviced. Because drivers enter the odometer at every shift, it knows when the next one is coming.',
    },
    {
      title: 'Let the first shift run',
      body: 'A driver picks the car, enters the odometer and confirms the checks. From that moment you have hours, kilometres, who had which car, and a dot on the map.',
    },
    {
      title: 'Add what you want, when you want it',
      body: 'Rosters, weekly settlements, bookkeeping, messages. Each is a module you switch on when you are ready for it, and off again if you are not using it.',
    },
  ],

  includedTitle: 'What a small fleet gets on day one',
  included: [
    { icon: 'car', title: 'Every car in one place', body: 'Documents, odometer, who drives it and when it was last serviced.' },
    { icon: 'bell', title: 'Reminders before things lapse', body: 'Insurance, road licence and driver documents, flagged well ahead of the date.' },
    { icon: 'wrench', title: 'Service tracking', body: 'Service due by kilometres or by date, worked out from the odometer drivers enter.' },
    { icon: 'clock', title: 'Shifts', body: 'Who drove which car, for how long and how far, with pre-shift checks every time.' },
    { icon: 'pulse', title: 'Live map', body: 'See your cars on a map using the drivers’ phones. Nothing to fit.' },
    { icon: 'camera', title: 'Damage log', body: 'Mark the spot on a diagram of the car, add photos, and keep the repair cost with it.' },
    { icon: 'phone', title: 'Free driver app', body: 'For every driver, at no extra cost.' },
    { icon: 'users', title: 'As many logins as you need', body: 'Add a partner, a bookkeeper or a manager without paying per person.' },
    { icon: 'shield', title: 'Your data stays yours', body: 'Hosted in the EU, encrypted, and exportable whenever you like.' },
  ],

  limits: [
    {
      title: 'The smallest plan keeps things simple',
      body: 'The entry plan covers vehicles, drivers, shifts, rosters and a basic live map. Weekly driver settlements, bookkeeping and the full map with zones and route playback are on the plan above it. Both are on the pricing page with what each includes.',
    },
    {
      title: 'It will not find you work',
      body: 'Rovora is not a booking app and does not send jobs to drivers. It manages the fleet around the work you already have.',
    },
    {
      title: 'Somebody still has to enter things',
      body: 'Drivers enter the odometer and you enter costs and weekly earnings. Rovora removes the adding up and the remembering, not the facts.',
    },
    {
      title: 'The driver app is on Android',
      body: 'iPhone drivers use Rovora in the browser for now. An iPhone app is on the roadmap.',
    },
  ],

  faq: [
    {
      q: 'Is Rovora worth it for just two or three cars?',
      a: 'It is built to start there. The entry plan is priced for very small fleets, and the first thing it does, warning you before insurance, a road licence or a service is missed, pays for itself the first time it catches one. See the pricing page for the current price.',
    },
    {
      q: 'How long does it take to set up?',
      a: 'An afternoon for most small fleets. Adding a car takes a couple of minutes, and you can start with vehicles and drivers and switch on the rest later.',
    },
    {
      q: 'I am not good with computers. Is it complicated?',
      a: 'If you can use a ride-hailing app, you can use Rovora. It works on a phone, there is a getting-started checklist on the dashboard, and you can book a walkthrough with a person if you would rather be shown.',
    },
    {
      q: 'Do I need to buy GPS trackers?',
      a: 'No. The live map uses the phone your driver already carries, through the free app, and only while they are on shift.',
    },
    {
      q: 'Can I move my existing spreadsheet over?',
      a: 'Yes. Enter your cars and drivers by hand in minutes, or send us the spreadsheet and we will help you bring it in.',
    },
    {
      q: 'Am I tied into a contract?',
      a: 'No. It is billed monthly per vehicle, there is no minimum term, and you can cancel or export your data at any time.',
    },
  ],
  related: ['/features/vehicles', '/features/maintenance', '/features/driver-app'],

  cta: {
    title: 'Get it out of your head and onto one screen.',
    body: 'Get your {free} free, no card. Add your first car in two minutes.',
  },
};

/* ───────────────────────── Growing fleets ───────────────────────── */

export const FOR_GROWING: DeepContent = {
  path: '/for/growing-fleets',
  crumb: { parent: PARENT, name: 'Growing fleets' },
  eyebrow: 'For fleets of 10 to 75 cars',
  title: 'When the fleet outgrows the owner’s phone,',
  accent: 'give the office a system.',
  sub: 'At ten cars you could still hold it all yourself. At twenty-five there is a dispatcher, somebody doing pay, and a garage on speed dial. Rovora gives each of them the part they need, and you the record of what was done.',
  proof: [
    'Staff logins with their own permissions',
    'Audit log of key actions',
    'REST API on the Fleet plan',
    'Guided onboarding on the Fleet plan',
  ],
  mock: {
    path: 'fleet/staff',
    title: 'Team & permissions',
    pill: '5 people',
    rows: [
      { name: 'Anna (owner)', meta: 'Administrator', st: 'Everything' },
      { name: 'Daniel', meta: 'Staff · rosters, shifts, vehicles', st: 'View + edit' },
      { name: 'Rita', meta: 'Staff · services, damages', st: 'View + create' },
      { name: 'Audit log', meta: 'Daniel published roster · week 47', st: '09:14' },
    ],
  },

  audienceTitle: 'Who needs what',
  audience: [
    {
      who: 'The owner',
      situation:
        'You want to stop being the person every question goes through, without losing sight of the money.',
      gets: 'Admin access to everything, including the books, plus a log of key actions your team took.',
    },
    {
      who: 'The dispatcher or fleet manager',
      situation:
        'You plan the week, cover the gaps when someone calls in sick, and field every “which car am I in?” message.',
      gets: 'Rosters, shifts, the live map and messages, without access to the books.',
    },
    {
      who: 'The person who does pay and the accounts',
      situation:
        'Thirty settlements a week, each a little different, and an accountant who wants the quarter by Friday.',
      gets: 'A settlement screen built for entering many drivers quickly, PDFs with a page per driver, and exports your accountant can import.',
    },
  ],

  painsTitle: 'What breaks between 10 and 30 cars',
  pains: [
    {
      title: 'Everything goes through one person',
      body: 'The owner approved every swap and remembered every deal. Now that is a queue, and things wait for you to answer your phone.',
    },
    {
      title: 'Shared logins and shared spreadsheets',
      body: 'Three people use the same password and the same file. When a number changes, nobody can say who changed it or why.',
    },
    {
      title: 'Thirty drivers, thirty different deals',
      body: 'One is on 50%, one rents the car, one gets a guaranteed wage. The exceptions live in somebody’s head and come out wrong when that person is on holiday.',
    },
    {
      title: 'No idea which cars are earning',
      body: 'You know the fleet’s total. Finding the three cars that cost more than they make means a week of somebody’s time.',
    },
  ],

  stepsKicker: 'How a bigger fleet runs on Rovora',
  stepsTitle: 'Give each job to the person who does it',
  steps: [
    {
      title: 'Bring your data in',
      body: 'Add vehicles and drivers yourself, or send the spreadsheet. On the Fleet plan we import it for you and walk your team through the setup.',
    },
    {
      title: 'Add your office staff',
      body: 'Each person gets their own login. For every area, such as drivers, vehicles, shifts, rosters, services, damages and reminders, you choose whether they can view, create, edit or delete.',
    },
    {
      title: 'Set the pay schemes once',
      body: 'A default scheme for the fleet and an override for each driver with a different deal. The scheme in force is saved with every settlement, so changing a deal next month does not rewrite last month.',
    },
    {
      title: 'Let the day run itself',
      body: 'Drivers start their own shifts with the car, odometer and checks. The live map shows who is working, and tells you which on-shift drivers are not sharing their location and why.',
    },
    {
      title: 'Settle thirty drivers in one sitting',
      body: 'Import the platform CSVs or type figures in on the spreadsheet-style screen, moving driver to driver with the keyboard. Finalise the week and export the PDFs in one go.',
    },
    {
      title: 'Check what happened',
      body: 'The audit log records key actions across the fleet. When a figure looks wrong, you can see who did what, and when.',
    },
  ],

  includedTitle: 'What growing fleets rely on',
  included: [
    { icon: 'users', title: 'Staff permissions', body: 'View, create, edit and delete, set separately for each area and each person.' },
    { icon: 'shield', title: 'Audit log', body: 'A record of key actions, so changes have a name and a time against them.' },
    { icon: 'coins', title: 'Settlements at volume', body: 'Keyboard-driven entry, CSV import per platform, bulk mark-as-paid and one-page-per-driver PDFs.' },
    { icon: 'sliders', title: 'Per-driver pay schemes', body: 'Share, rent, hourly or fixed wage and tax, mixed however each deal needs.' },
    { icon: 'bolt', title: 'Bolt connection', body: 'Per-driver and per-vehicle Bolt figures, including cars that have gone idle.' },
    { icon: 'gauge', title: 'Safety scores', body: 'A 0–100 score per driver, with every harsh event on a map.' },
    { icon: 'send', title: 'Messages', body: 'Groups for shifts or depots, and announcements only managers can post in.' },
    { icon: 'file', title: 'API and exports', body: 'A REST API with scoped keys on plans that include API access, and CSV exports for accounting.' },
    { icon: 'sliders', title: 'Modules', body: 'Switch off what you do not use, so each person’s menu only shows what matters.' },
  ],

  limits: [
    {
      title: 'Above 75 vehicles is a conversation',
      body: 'The self-serve plans go up to 75 vehicles. Larger fleets are on Enterprise, priced with you, with a named person to deal with.',
    },
    {
      title: 'Permissions are per area, not per vehicle',
      body: 'You can decide that someone manages rosters but cannot see settings. You cannot limit a staff member to a particular depot or a particular set of cars.',
    },
    {
      title: 'The books are for admins only',
      body: 'Bookkeeping and Financials are restricted to fleet administrators. Staff can work on settlements and adjustments, but they cannot open the books.',
    },
    {
      title: 'No dispatch, no payroll filing',
      body: 'Rovora does not assign jobs to drivers and does not submit payroll or tax returns. It produces the figures your accountant files.',
    },
  ],

  faq: [
    {
      q: 'Can my staff have access to some things but not others?',
      a: 'Yes. Each staff member has their own login, and for each area of Rovora you choose whether they can view, create, edit or delete. Drivers only ever see their own shifts, roster and pay.',
    },
    {
      q: 'Do you charge per user?',
      a: 'No. Pricing is per vehicle, and there is no charge per login for office staff or for drivers. Each plan has a driver limit that matches its vehicle limit.',
    },
    {
      q: 'Can you import our existing data?',
      a: 'Yes. Send us your spreadsheet of drivers and vehicles. On the Fleet plan the import is done for you as part of guided onboarding.',
    },
    {
      q: 'Is there an API?',
      a: 'Yes, on plans that include API access, which today means the Fleet plan and above. Your own tools can read and update drivers, vehicles and bookkeeping transactions using keys you create in the dashboard. The documentation is public at rovora.eu/docs/api.',
    },
    {
      q: 'We run more than one company. Can we keep the fleets separate?',
      a: 'Yes. One login can belong to more than one fleet and switch between them, and each fleet’s data is kept apart. A driver cannot be on shift in two fleets at once.',
    },
    {
      q: 'What happens when we go over our plan’s vehicle limit?',
      a: 'Each plan includes a number of vehicles and charges a small amount for each one above it, up to that plan’s limit. The Billing page shows the exact monthly total as you add cars.',
    },
  ],
  related: ['/features/settlements', '/features/safety', '/pricing'],

  cta: {
    title: 'Hand over the jobs, keep the oversight.',
    body: 'Get your {free} free, no card. Or book a walkthrough and we will set it up with your team.',
  },
};
