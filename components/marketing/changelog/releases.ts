/**
 * Rovora changelog — single source of truth for the /changelog page.
 *
 * Written for fleet operators, not developers: each entry translates what we
 * shipped into plain English. Newest release first. To announce something new,
 * add a Release at the top of RELEASES and it appears on the page automatically.
 */

export type ChangeTag = 'new' | 'improved' | 'fixed' | 'security';

export interface ChangeItem {
  /** What kind of change this is — drives the coloured chip. */
  tag: ChangeTag;
  /** Area of the product, e.g. 'Live tracking', 'Settlements'. */
  area: string;
  /** One-line, plain-English description of the change. */
  text: string;
}

export interface Release {
  /** Stable anchor id, e.g. '2026-07'. */
  id: string;
  /** ISO date of the release (used for ordering & <time>). */
  date: string;
  /** Human date shown on the page, e.g. 'July 2026'. */
  dateHuman: string;
  /** Headline theme for the release. */
  title: string;
  /** One or two sentences introducing the release. */
  summary: string;
  /** Marks the newest / featured release. */
  highlight?: boolean;
  items: ChangeItem[];
}

export const RELEASES: Release[] = [
  {
    id: '2026-11-rovora-ai',
    date: '2026-11-18',
    dateHuman: 'November 2026',
    title: 'Rovora AI: ask your fleet anything',
    summary:
      'Ask a question in plain English and get the answer from your own fleet’s data — costs, drivers, shifts, services, documents — with links to the records behind it. It’s in every plan today.',
    highlight: true,
    items: [
      {
        tag: 'new',
        area: 'Rovora AI',
        text: 'Click Ask AI in the top bar (or press ⌘K and type a question) to ask things like “which car cost me the most last month?” or “who skipped a pre-shift check this week?”.',
      },
      {
        tag: 'new',
        area: 'Rovora AI',
        text: 'Every answer shows the dates it used and links to the drivers, cars and pages it came from, so you can check the numbers in one click.',
      },
      {
        tag: 'security',
        area: 'Rovora AI',
        text: 'It only reads — it never changes anything. Staff only get answers about what their role can already see, and money questions stay with fleet admins. ID and licence numbers, contact details, photos and locations are never sent to the AI.',
      },
      {
        tag: 'new',
        area: 'Rovora AI',
        text: 'Included in every plan with a monthly allowance. Fleet admins can switch it off under Integrations → Your modules.',
      },
    ],
  },
  {
    id: '2026-11-gps-settings',
    date: '2026-11-18',
    dateHuman: 'November 2026',
    title: 'Your GPS trackers on the map, and settings that fit your fleet',
    summary:
      'Already have trackers in your cars? Connect them and see every car on the Live Map next to your drivers. Settings has been rebuilt with the rules your fleet actually runs by, and every vehicle now has its whole story on one tabbed page.',
    items: [
      {
        tag: 'new',
        area: 'GPS trackers',
        text: 'Connect the GPS platform you already use — Traccar, flespi, Wialon, Navixy, Samsara, Geotab or Mapon — by pasting its key. Each tracker is matched to your car by number plate and its position updates every minute.',
      },
      {
        tag: 'improved',
        area: 'Live tracking',
        text: 'The Live Map now has Drivers and Cars tickboxes. A driver on shift is drawn inside their car, and a new Cars tab shows which cars are moving and where each one has been today.',
      },
      {
        tag: 'security',
        area: 'Privacy',
        text: 'A car with nobody on shift in it is hidden from the map and no route is kept for it. That is the default; fleet admins can change it.',
      },
      {
        tag: 'new',
        area: 'Settings',
        text: 'Settings is now split into tabs — General, Branding, Documents, Maintenance, Live Map, Shifts, Messages, Notifications, Settlements and Preferences — and other pages link straight to their own tab.',
      },
      {
        tag: 'new',
        area: 'Settings',
        text: 'Decide how early you are warned before a document expires, how many kilometres before a service counts as due soon, and how long expired documents keep alerting.',
      },
      {
        tag: 'new',
        area: 'Shifts',
        text: 'Choose your own start- and end-of-shift rules: switch the dashcam or interior check off, make vehicle photos optional, required or hidden, and decide whether the closing odometer reading is required.',
      },
      {
        tag: 'new',
        area: 'Settings',
        text: 'Set your fleet’s currency and number format once, and it is used everywhere your fleet sees money. Pick where the Live Map opens by clicking on a map.',
      },
      {
        tag: 'new',
        area: 'Vehicles',
        text: 'The vehicle page is now split into tabs — Overview, Shifts, Service & parts, Damages, Costs, Documents and Timeline — with “coming up” tiles for the next service, insurance and road licence, and a 12-month cost summary per car for admins.',
      },
      {
        tag: 'new',
        area: 'Vehicles',
        text: 'Switch the Vehicles list between cards and a sortable table: status, driver, odometer, next service, insurance and road licence expiry, open damages and 7-day use, one row per car.',
      },
      {
        tag: 'improved',
        area: 'Navigation',
        text: 'A tidier sidebar: Live Map, GPS Trackers, Trips and Safety sit together under Tracking, Bolt moves to Financial, and every section can be folded away.',
      },
      {
        tag: 'new',
        area: 'Dashboard',
        text: 'Quick buttons: pin up to four shortcuts — add an expense, new roster, driver balances, Live Map and more — to the top bar, next to the page title. They are yours alone and follow you to every device.',
      },
      {
        tag: 'improved',
        area: 'Settings',
        text: 'Settings is easier to read, especially on a phone: each section is one clean list, switches sit beside their label, and choices and fields are full-width and easy to tap.',
      },
      {
        tag: 'improved',
        area: 'Preferences',
        text: 'Your theme is saved to your account, so it follows you to every device. Each person also chooses their start page and whether fleet alerts reach them by email, by push, or both.',
      },
    ],
  },
  {
    id: '2026-11-messages-bolt',
    date: '2026-11-17',
    dateHuman: 'November 2026',
    title: 'Retire the WhatsApp group — and connect Bolt',
    summary:
      'Talk to your drivers inside Rovora instead of a WhatsApp group that never quite matches who works for you, and see your Bolt rides, fares and drivers next to everything else. Plus a much shorter sign-up for new fleets.',
    items: [
      {
        tag: 'new',
        area: 'Messages',
        text: 'Chat with your drivers in Rovora: one-to-one chats, groups you create, announcement-only groups, and an automatic “Everyone” group that drivers join and leave with the fleet — so nobody who has left is still reading.',
      },
      {
        tag: 'new',
        area: 'Messages',
        text: 'Send photos and files, see when a message has been read, mute a chat, or delete a message for everyone. Unread badges in the sidebar, the top bar and the driver’s bottom tabs, and browser notifications for managers.',
      },
      {
        tag: 'new',
        area: 'Messages',
        text: 'You decide whether drivers can message each other directly. In the Rovora Driver app, tapping a message notification opens that chat.',
      },
      {
        tag: 'new',
        area: 'Bolt',
        text: 'Connect your Bolt fleet account with a Fleet API key and Rovora imports your Bolt drivers, vehicles and rides, refreshed every hour. Keys are encrypted before they are stored.',
      },
      {
        tag: 'new',
        area: 'Bolt',
        text: 'A Bolt dashboard with five tabs: an overview (rides, fares, tips, acceptance, rating and who is online on Bolt right now), per-driver figures, revenue by day and hour, every ride offer, and per-car figures including idle cars.',
      },
      {
        tag: 'improved',
        area: 'Bolt',
        text: 'Bolt drivers are matched to your Rovora drivers automatically by email, phone or name, and you can correct any match by hand. Fares are shown before Bolt’s commission, which Bolt does not share yet.',
      },
      {
        tag: 'improved',
        area: 'Onboarding',
        text: 'Setting up a new fleet is now one screen — name your fleet and you are in. Vehicles, drivers and pay are covered by the getting-started checklist on the dashboard.',
      },
      {
        tag: 'improved',
        area: 'Sign-up',
        text: 'The verification email has a one-tap “Verify my email” button, with the code still underneath. Switching to your mail app and back no longer loses the code screen.',
      },
      {
        tag: 'improved',
        area: 'Billing',
        text: 'Fleet admins get an email a few days before the free period ends, and again if it has ended, so the dashboard pausing is never a surprise. Your data is always kept.',
      },
      {
        tag: 'fixed',
        area: 'Settlements',
        text: 'Settlement PDFs now print the € sign and Maltese letters (ħ, ġ, ż, ċ) correctly on iPhone, iPad and Mac. Before, “€1048.06” could read as “€048.06”.',
      },
      {
        tag: 'fixed',
        area: 'Adjustments',
        text: 'On phones, the add/edit dialog is no longer hidden behind the bottom navigation, and the filter bar has its own phone layout.',
      },
    ],
  },
  {
    id: '2026-10-safety-billing',
    date: '2026-10-26',
    dateHuman: 'October 2026',
    title: 'Every harsh-driving event, on the map',
    summary:
      'Click any safety event and see exactly where and how it happened. The driver app also got much better at telling a real harsh brake from a pothole. Billing now shows what you will actually pay, extra vehicles included.',
    items: [
      {
        tag: 'new',
        area: 'Safety',
        text: 'Open any driver’s safety card to see every event — harsh braking, acceleration, cornering and speeding — on a map, with the route a few minutes either side, speed before and after, how strong it was, the car, the shift and the street name. Links straight to Google Maps and Street View.',
      },
      {
        tag: 'new',
        area: 'Safety',
        text: 'A fleet-wide “Where events happen” map shows the spots where your drivers brake or corner hard most often.',
      },
      {
        tag: 'improved',
        area: 'Driver app',
        text: 'Smarter harsh-driving detection (Rovora Driver 1.0.4): potholes and bumps no longer count, picking up or moving the phone is ignored, sharp cornering is now detected, and each event records its exact spot and speed.',
      },
      {
        tag: 'improved',
        area: 'Billing',
        text: 'Plan cards show how many vehicles are included and the price per extra vehicle, and the Billing page shows your real monthly total with a breakdown. Changing plan updates your existing subscription instead of starting a second one.',
      },
      {
        tag: 'fixed',
        area: 'Billing',
        text: 'Choosing a plan could show an error page in rare cases; it now always either opens checkout or tells you what went wrong.',
      },
      {
        tag: 'security',
        area: 'Privacy',
        text: 'The rovora.eu website has a cookie banner with equally weighted Allow and Decline buttons, respects Global Privacy Control, and loads no Google tags until you click Allow. Nothing tracks you inside the signed-in app.',
      },
    ],
  },
  {
    id: '2026-10-tracking',
    date: '2026-10-05',
    dateHuman: 'October 2026',
    title: 'On shift means on the map',
    summary:
      'A driver on shift but missing from the map now gets noticed — by the app, and by you, with the exact reason and how to fix it. Shifts left open by mistake close themselves, and you can sign in with Google.',
    items: [
      {
        tag: 'new',
        area: 'Live tracking',
        text: 'An “On shift, not sharing location” box on the Live Map lists every on-shift driver you can’t see, with the specific reason and what to tell them — for example “location only allowed while the app is open” or “using the website instead of the app”.',
      },
      {
        tag: 'improved',
        area: 'Live tracking',
        text: 'Parked cars stay on the map as “Parked” instead of dropping to “Offline”, and if the phone stops sharing mid-shift the app restarts it. The Activity feed shows when a driver’s signal was lost and when it came back.',
      },
      {
        tag: 'improved',
        area: 'Driver app',
        text: 'Before tracking starts, the app checks location access and, if something is missing, shows a pop-up that takes the driver straight to the fix. It keeps reminding on-shift drivers who aren’t sharing, even with the app closed.',
      },
      {
        tag: 'new',
        area: 'Shifts',
        text: '“Are you still on shift?” — choose after how many hours drivers are asked, and how long they have to answer before the shift is ended automatically at the moment they were asked. No more 20-hour shifts from a forgotten tap.',
      },
      {
        tag: 'new',
        area: 'Settings',
        text: 'Fleet settings to turn live location during shifts on or off, and to require working location access before a driver can start a shift. Fleet admins can also edit the fleet’s name, legal name, VAT number and contact details.',
      },
      {
        tag: 'new',
        area: 'Driver app',
        text: 'Drivers on an old version of Rovora Driver see an “Update required” screen that opens Google Play, so everyone is on the version with the latest fixes.',
      },
      {
        tag: 'new',
        area: 'Sign-in',
        text: 'Sign in and sign up with Google.',
      },
      {
        tag: 'security',
        area: 'Invitations',
        text: 'Adding someone who already has a Rovora account now sends them an invitation to accept or decline, instead of adding them to your fleet straight away. A driver in two fleets can’t be on shift in both at once.',
      },
      {
        tag: 'security',
        area: 'Sign-in',
        text: 'Password-reset emails can be resent from a “Check your inbox” screen, with server-side limits so the button can’t be abused to flood an inbox.',
      },
      {
        tag: 'improved',
        area: 'Staff',
        text: 'The staff details page now matches the driver page, shows the person’s role in this fleet and when they joined, and dates in your fleet’s time zone.',
      },
      {
        tag: 'fixed',
        area: 'Drivers',
        text: 'Admins can remove a driver again, from the bottom of the driver page. The confirmation explains what is deleted and suggests setting the driver to Inactive to keep their history.',
      },
      {
        tag: 'fixed',
        area: 'Driver app',
        text: 'The Android app no longer asks for the “physical activity” permission — harsh-driving detection never needed it.',
      },
    ],
  },
  {
    id: '2026-09-settlements-api',
    date: '2026-09-30',
    dateHuman: 'September 2026',
    title: 'Faster settlements, clearer PDFs and an open API',
    summary:
      'Running the weekly settlement takes fewer clicks, and every PDF now starts with the one number drivers care about: what they are owed. Developers can connect their own tools with the new Rovora API.',
    items: [
      {
        tag: 'new',
        area: 'API',
        text: 'The Rovora REST API, on plans that include API access: create API keys in the dashboard and read, add and update drivers, vehicles and bookkeeping transactions from your own tools. Full documentation at rovora.eu/docs/api.',
      },
      {
        tag: 'improved',
        area: 'Settlements',
        text: 'Setting up a week is quicker: “Next week” and “Next 4 weeks” chips continue from your latest week, the end date fills itself in, and you are told when rent, wages and flat tax will be scaled for a shorter or longer period.',
      },
      {
        tag: 'improved',
        area: 'Settlements',
        text: 'Spreadsheet-style entry: Enter moves to the next field, Ctrl/⌘+Enter saves a draft, and Previous / Next show the neighbouring driver’s name. The driver list shows each driver’s balance for the week.',
      },
      {
        tag: 'new',
        area: 'Settlements',
        text: 'Settlement PDFs lead with “Amount owed to driver” — the weeks earned this month minus those already paid — and fit each driver on a single page.',
      },
      {
        tag: 'improved',
        area: 'Settlements',
        text: 'The setup wizard now asks whether your drivers keep cash fares or hand them in, instead of always deducting cash.',
      },
      {
        tag: 'new',
        area: 'Billing',
        text: 'See your invoice history (with PDFs) on the Billing page, and update your card or cancel from “Manage payment method”.',
      },
      {
        tag: 'fixed',
        area: 'Sign-in',
        text: 'Passwords of 6 or 7 characters were accepted by the form but then refused when saved. The minimum is now 6 everywhere.',
      },
      {
        tag: 'security',
        area: 'Platform',
        text: 'Core platform components updated, including a critical framework security fix. No known vulnerabilities.',
      },
    ],
  },
  {
    id: '2026-09-ledger',
    date: '2026-09-16',
    dateHuman: 'September 2026',
    title: 'Book it the moment it happens',
    summary:
      'Spent €20 on a car wash today? It goes in today — from your phone, receipt photo and all. Bookkeeping is now a running ledger of dated transactions, the way Xero and QuickBooks work, so there is nothing to remember until the end of the week and nothing to add up on Sunday.',
    items: [
      {
        tag: 'new',
        area: 'Bookkeeping',
        text: 'Add an expense or income in one tap from the Bookkeeping page, the dashboard or the “New” menu: amount, date (today by default), category, a note and an optional receipt photo. “Save & add another” for a handful of receipts in a row.',
      },
      {
        tag: 'new',
        area: 'Bookkeeping',
        text: 'Totals for today, this week, the last 4 weeks, this month, last month, this quarter, this year or any custom range — worked out from the lines, with a comparison to the range before. No periods to open or close.',
      },
      {
        tag: 'new',
        area: 'Bookkeeping',
        text: 'Tag a line to a vehicle or a driver, note who it was paid to, and search or filter the ledger by any of them. Download what you are looking at as a CSV for your accountant.',
      },
      {
        tag: 'improved',
        area: 'Recurring costs',
        text: 'Lease, finance, road tax and insurance now behave like repeating bills: set them up once and a line is posted automatically on every due date, marked “Auto”. The Bookkeeping page shows what is coming up next.',
      },
      {
        tag: 'improved',
        area: 'Financials',
        text: 'The Financials dashboard, the weekly bulk picker and the Xero & QuickBooks exports now run on individual transactions, so every export line is a real dated transaction rather than a period total.',
      },
      {
        tag: 'improved',
        area: 'Bookkeeping',
        text: 'Everything you recorded in the old period sheets was carried over automatically, dated on the day each period ended and marked “Imported”. Your totals are unchanged.',
      },
    ],
  },
  {
    id: '2026-07-books',
    date: '2026-07-27',
    dateHuman: 'July 2026',
    title: 'Bookkeeping your way — your categories, your periods',
    summary:
      'Books no longer have to be weekly, and no longer have to use our categories. Keep them monthly if that suits your accountant, add the expense lines your fleet actually has, and let vehicle costs fill themselves in.',
    items: [
      {
        tag: 'new',
        area: 'Bookkeeping',
        text: 'Choose how you keep your books: weekly, monthly, or any custom date range. Pick a month and the dates and title fill themselves in.',
      },
      {
        tag: 'new',
        area: 'Bookkeeping',
        text: 'Your own income and expense categories. Add fuel, tolls, cleaning, licensing, parking fines or anything else — from a one-click list of common ones, or build your own with a name, icon and colour.',
      },
      {
        tag: 'new',
        area: 'Vehicle costs',
        text: 'Record what each vehicle costs you to run — lease, finance, road tax, insurance — once. Every new period gets it added automatically, split by the number of days it covers.',
      },
      {
        tag: 'improved',
        area: 'Financials',
        text: 'Charts, pie breakdowns, the accountant journal and the Xero & QuickBooks exports all follow your categories now, so anything you add shows up everywhere without extra setup.',
      },
      {
        tag: 'fixed',
        area: 'Financials',
        text: 'A period spanning the end of a month is now split across both months by day count. Before, a week running 29 June – 5 July counted entirely as June, overstating one month and understating the next.',
      },
    ],
  },
  {
    id: '2026-07',
    date: '2026-07-09',
    dateHuman: 'July 2026',
    title: 'A modular fleet, integrations & smarter driver pay',
    summary:
      'Rovora becomes modular — switch features on and off for each fleet — plus a brand-new integrations marketplace and a much smarter way to set up driver pay.',
    items: [
      {
        tag: 'new',
        area: 'Apps & modules',
        text: 'Turn features on or off for each fleet — settlements, bookkeeping, rostering, tracking, maintenance, reminders and parts. Your dashboard only shows what you actually use.',
      },
      {
        tag: 'new',
        area: 'Integrations',
        text: 'A new integrations marketplace to connect GPS trackers, ride-hail platforms, WhatsApp and email. Accountant-ready exports for Xero & QuickBooks are live today.',
      },
      {
        tag: 'new',
        area: 'Driver pay',
        text: 'Pay models let you set hourly or fixed wages and pick exactly which extras (splits, tips, campaigns, rent) apply to each driver — with a guided pay interview that builds it all for you.',
      },
      {
        tag: 'new',
        area: 'Parts & inventory',
        text: 'Track parts and stock alongside maintenance, so you know what a repair really costs.',
      },
      {
        tag: 'improved',
        area: 'Onboarding',
        text: 'A getting-started checklist and first-visit prompts walk new fleets through setup step by step.',
      },
      {
        tag: 'security',
        area: 'Platform',
        text: 'Closed a cross-fleet data-visibility gap on reminders, tightened billing and roster permissions, and fixed an open-redirect.',
      },
    ],
  },
  {
    id: '2026-07-early',
    date: '2026-07-04',
    dateHuman: 'Early July 2026',
    title: 'We’re now Rovora — live on Google Play',
    summary:
      'Spot became Rovora, we launched at rovora.eu, and the free driver app landed on Google Play.',
    items: [
      {
        tag: 'improved',
        area: 'Brand',
        text: 'Spot is now Rovora — new name, new logo and a home at rovora.eu.',
      },
      {
        tag: 'new',
        area: 'Driver app',
        text: 'The free Rovora Driver app is live on Google Play, with a download badge across the site.',
      },
      {
        tag: 'new',
        area: 'Blog',
        text: 'Launched the fleet operator’s blog with five in-depth, no-fluff guides.',
      },
      {
        tag: 'improved',
        area: 'Platform',
        text: 'Automated reminders switched back on now we’re live, plus site-wide search-engine metadata and social cards.',
      },
      {
        tag: 'security',
        area: 'Platform',
        text: 'Tenant-isolation hardening so every fleet’s data stays firmly its own.',
      },
    ],
  },
  {
    id: '2026-06',
    date: '2026-06-11',
    dateHuman: 'June 2026',
    title: 'Live driver tracking — no hardware needed',
    summary:
      'Our biggest release yet: see your whole fleet on a live map using just the driver’s phone — no GPS boxes to fit or wire in.',
    items: [
      {
        tag: 'new',
        area: 'Live tracking',
        text: 'Watch every on-shift driver move on a live fleet map, straight from the free driver app — no hardware to install.',
      },
      {
        tag: 'new',
        area: 'Live tracking',
        text: 'Route playback, trip distances, speeding alerts and lost-signal alerts.',
      },
      {
        tag: 'new',
        area: 'Live tracking',
        text: 'Geofence zones that alert you the moment a vehicle enters or leaves an area.',
      },
      {
        tag: 'new',
        area: 'Driver app',
        text: 'A brand-new Rovora Driver app (Android) with reliable background location and built-in crash reporting.',
      },
      {
        tag: 'new',
        area: 'Settlements',
        text: 'A guided settlements setup wizard builds your platforms, pay preset and weekly charges from a few simple questions.',
      },
      {
        tag: 'improved',
        area: 'Pricing',
        text: 'New per-vehicle pricing with an interactive calculator, so you see your exact monthly cost before you sign up.',
      },
      {
        tag: 'improved',
        area: 'Support',
        text: 'Added an AI support chat to the site that answers fleet and pricing questions instantly.',
      },
    ],
  },
  {
    id: '2026-05',
    date: '2026-05-08',
    dateHuman: 'May 2026',
    title: 'Invoicing & a cleaner platform',
    summary: 'Invoicing arrives, and the admin area gets a tidy-up and a clearer name.',
    items: [
      {
        tag: 'new',
        area: 'Bookkeeping',
        text: 'Create and manage invoices for your fleet, packaged up alongside your financials.',
      },
      {
        tag: 'improved',
        area: 'Platform',
        text: 'Renamed the admin area to “Fleet” and streamlined setup for new operators.',
      },
    ],
  },
  {
    id: '2026-04',
    date: '2026-04-08',
    dateHuman: 'April 2026',
    title: 'Office staff, permissions & an audit log',
    summary:
      'Bring your office team into Rovora with exactly the right access — and keep a full record of who did what.',
    items: [
      {
        tag: 'new',
        area: 'Staff',
        text: 'Add office staff with fine-grained permissions controlling what each person can see and do.',
      },
      {
        tag: 'new',
        area: 'Platform',
        text: 'An audit log records key actions across your fleet, so nothing happens without a trail.',
      },
      {
        tag: 'improved',
        area: 'Reminders',
        text: 'More reliable document, service and shift reminders, with tighter access rules behind them.',
      },
    ],
  },
  {
    id: '2026-03',
    date: '2026-03-25',
    dateHuman: 'March 2026',
    title: 'Vehicle damage, mapped visually',
    summary:
      'Log damage right on a diagram of the car, and keep reminders running quietly in the background.',
    items: [
      {
        tag: 'new',
        area: 'Damage',
        text: 'Mark damage directly on a car diagram with a built-in drawing editor — no more vague notes.',
      },
      {
        tag: 'new',
        area: 'Adjustments',
        text: 'A new adjustments card makes one-off charges and credits quick to add to a settlement.',
      },
      {
        tag: 'improved',
        area: 'Reminders',
        text: 'Scheduled background jobs keep document, service and shift reminders firing automatically.',
      },
      {
        tag: 'improved',
        area: 'Driver app',
        text: 'Push-notification reminders and a polished tablet layout for the driver app.',
      },
    ],
  },
  {
    id: '2026-02',
    date: '2026-02-09',
    dateHuman: 'February 2026',
    title: 'Damage reports & clearer financials',
    summary:
      'Track vehicle damage with photos and permissions, and get a cleaner view of the money.',
    items: [
      {
        tag: 'new',
        area: 'Damage',
        text: 'A dedicated damage page with photo uploads and per-role permissions.',
      },
      {
        tag: 'improved',
        area: 'Financials',
        text: 'Refreshed financial dashboards, plus tidier drivers and vehicles pages.',
      },
      {
        tag: 'improved',
        area: 'Platform',
        text: 'Added crash reporting so we spot and fix problems faster than you can report them.',
      },
    ],
  },
  {
    id: '2026-01',
    date: '2026-01-21',
    dateHuman: 'January 2026',
    title: 'Settlements, earnings & dark mode',
    summary:
      'A big month for money: weekly settlements, driver earnings, bookkeeping and analytics — plus a dark mode for the late shifts.',
    items: [
      {
        tag: 'new',
        area: 'Settlements',
        text: 'Weekly driver settlements with financial graphs and analytics.',
      },
      {
        tag: 'new',
        area: 'Driver pay',
        text: 'Drivers get their own earnings and financials view on their phone.',
      },
      {
        tag: 'new',
        area: 'Bookkeeping',
        text: 'Earnings and adjustments now feed straight into bookkeeping.',
      },
      {
        tag: 'new',
        area: 'Settlements',
        text: 'Export settlements for your own records in a couple of clicks.',
      },
      {
        tag: 'improved',
        area: 'Design',
        text: 'Light and dark mode across the whole dashboard.',
      },
      {
        tag: 'fixed',
        area: 'Notifications',
        text: 'Dynamic, timezone-aware emails and a batch of notification fixes.',
      },
    ],
  },
  {
    id: '2025-12',
    date: '2025-12-03',
    dateHuman: 'December 2025',
    title: 'Rovora launches',
    summary:
      'The very first release — everything a fleet needs on day one: rosters, shifts, driver settlements and an app you can install on your phone.',
    items: [
      {
        tag: 'new',
        area: 'Platform',
        text: 'Rovora launches with drivers, vehicles, rosters and settlement balances in one place.',
      },
      {
        tag: 'new',
        area: 'Rosters',
        text: 'Build shift rosters and let drivers go on-shift straight from their phone.',
      },
      {
        tag: 'new',
        area: 'Driver app',
        text: 'An installable app (PWA) with push notifications — add Rovora to your home screen.',
      },
      {
        tag: 'new',
        area: 'Vehicles',
        text: 'Assign multiple vehicles to a driver and track service mileage as they drive.',
      },
      {
        tag: 'new',
        area: 'Staff',
        text: 'Staff profiles, employment types and secure password reset from the start.',
      },
    ],
  },
];

/** Human label for the most recent release date — handy for the hero meta. */
export const LATEST_UPDATED = RELEASES[0]?.dateHuman ?? '';

/** Total number of published releases. */
export const RELEASE_COUNT = RELEASES.length;
