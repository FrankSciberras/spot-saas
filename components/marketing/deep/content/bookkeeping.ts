import type { DeepContent } from '../types';

export const BOOKKEEPING: DeepContent = {
  path: '/features/bookkeeping',
  crumb: { parent: { name: 'Features', path: '/#features' }, name: 'Bookkeeping & financials' },
  eyebrow: 'Bookkeeping & financials',
  title: 'Know what the fleet made',
  accent: 'this week, not next quarter.',
  sub: 'Record every expense and every bit of income on the day it happens, from your phone, with the receipt attached. Rovora adds it up for any period you ask for and hands your accountant a clean export.',
  proof: [
    'Add an expense in one tap',
    'Receipt photos and PDFs',
    'Your own categories',
    'CSV export for Xero and QuickBooks',
  ],
  mock: {
    path: 'bookkeeping',
    title: 'Bookkeeping · this month',
    pill: 'Net €3,240',
    rows: [
      { name: 'Fuel', meta: 'Car 3 · receipt attached', amt: '−€62.00' },
      { name: 'Car wash', meta: 'today · cash', amt: '−€20.00' },
      { name: 'Insurance', meta: 'Car 5 · repeats monthly', amt: '−€118.00', st: 'Auto' },
      { name: 'Fleet share of fares', meta: 'week 46', amt: '€2,870.00' },
      { name: 'Lease', meta: 'Car 2 · due in 4 days', st: 'Upcoming', idle: true },
    ],
  },

  audienceTitle: 'Who keeps their books in Rovora',
  audience: [
    {
      who: 'Owners who do the books themselves',
      situation:
        'Receipts live in the glovebox and the door pocket until the end of the month, and by then you cannot remember which car the €45 was for.',
      gets: 'A “+” button on the phone: amount, category, photo of the receipt, done before you have left the garage.',
    },
    {
      who: 'Fleets with an accountant',
      situation:
        'Your accountant asks for the quarter and you spend an evening turning a folder of photos and a spreadsheet into something they can use.',
      gets: 'A CSV of dated transactions in the layout Xero and QuickBooks import, for whatever date range they ask for.',
    },
    {
      who: 'Anyone deciding which cars to keep',
      situation:
        'You know what the fleet makes in total. You do not know which of your cars costs more than it brings in.',
      gets: 'Every line can be tagged to a vehicle or a driver, so you can filter the ledger down to a single car.',
    },
  ],

  painsTitle: 'Why the books are always a month behind',
  pains: [
    {
      title: 'There is nowhere to put today’s receipt',
      body: 'If the books are a weekly or monthly sheet, a €20 car wash on a Tuesday has to wait until somebody opens the sheet. Half of them never make it.',
    },
    {
      title: 'The same lease is typed in twelve times a year',
      body: 'Lease, finance, insurance and road tax are the same every period. Somebody still enters them by hand, and one missed month makes the car look more profitable than it is.',
    },
    {
      title: 'Profit is a guess until the accountant calls',
      body: 'You find out how the quarter went six weeks after it ended, which is too late to do anything about it.',
    },
    {
      title: 'Your categories are not your accountant’s',
      body: 'A fixed list of categories never quite fits. Tolls end up under “other”, and “other” ends up being a third of the spend.',
    },
  ],

  stepsKicker: 'How it’s used',
  stepsTitle: 'A month of bookkeeping, start to finish',
  steps: [
    {
      title: 'Set up the costs that repeat',
      body: 'Once per vehicle, enter what it costs to keep: lease, finance, road tax, insurance. Rovora posts each one as a line on its due date from then on, marked “Auto”, and shows you what is coming up next.',
    },
    {
      title: 'Add the rest as it happens',
      body: 'Tap “New → Expense” from the dashboard or the Bookkeeping page. Amount first, today’s date already filled in, one tap for the category, a photo of the receipt if you have one. “Save & add another” gets a handful of receipts done in a row.',
    },
    {
      title: 'Tag what matters',
      body: 'Attach a line to a vehicle or a driver, note who it was paid to and how. Later you can search and filter the ledger by any of them.',
    },
    {
      title: 'Check the week on a Friday',
      body: 'Pick today, this week, the last four weeks, this month, last month, the quarter, the year or your own dates. Income, expenses, net and margin are worked out from the lines, with a comparison to the period before.',
    },
    {
      title: 'Look at the bigger picture in Financials',
      body: 'Charts and breakdowns of income and expenses by category follow whatever categories you set up, so anything you add shows up there without extra work.',
    },
    {
      title: 'Send it to your accountant',
      body: 'Download what you are looking at as a CSV, or use the Xero and QuickBooks export. Every line in the file is a real, dated transaction.',
    },
  ],

  includedTitle: 'Everything in Bookkeeping & Financials',
  included: [
    { icon: 'plusCircle', title: 'One-tap entry', body: 'Expense or income from the Bookkeeping page, the dashboard or the “New” menu, on a phone or a laptop.' },
    { icon: 'camera', title: 'Receipts attached', body: 'A photo or a PDF stored privately with the line it belongs to.' },
    { icon: 'sliders', title: 'Your own categories', body: 'Start from a list of common ones or build your own with a name, icon and colour, for income and for expenses.' },
    { icon: 'repeat', title: 'Recurring costs', body: 'Lease, finance, road tax and insurance posted automatically on every due date.' },
    { icon: 'calendar', title: 'Any date range', body: 'Presets from “today” to “this year”, or custom dates, each compared with the period before.' },
    { icon: 'car', title: 'Per vehicle and per driver', body: 'Tag lines and filter the ledger down to one car or one person.' },
    { icon: 'chart', title: 'Financials dashboard', body: 'Income, expenses and profit over time, with breakdowns by category.' },
    { icon: 'file', title: 'Exports', body: 'CSV of any view, plus a Xero and QuickBooks-ready export of your transactions.' },
    { icon: 'shield', title: 'Admins only', body: 'The books are visible to fleet admins. Drivers never see them.' },
  ],

  limits: [
    {
      title: 'It is not accounting software',
      body: 'Rovora keeps a clean record of what came in and went out. It does not file VAT returns, produce statutory accounts or replace your accountant. It gives them better numbers, sooner.',
    },
    {
      title: 'Xero and QuickBooks by file, not by live sync',
      body: 'The export is a CSV you import into your accounting software. A direct connection that pushes lines across on its own is on the roadmap.',
    },
    {
      title: 'No bank feed',
      body: 'Rovora does not connect to your bank. Lines are added by you, or posted automatically for the recurring costs you set up.',
    },
    {
      title: 'Receipts are stored, not read',
      body: 'Today you type the amount and attach the photo. Reading the receipt for you is part of Rovora AI, which is in development.',
    },
  ],

  faq: [
    {
      q: 'Can I record an expense from my phone?',
      a: 'Yes. The Bookkeeping page has a floating “+” button on phones. Enter the amount, pick a category, take a photo of the receipt and save. It takes a few seconds, which is the point: it gets recorded on the day instead of at the end of the month.',
    },
    {
      q: 'Can I use my own expense categories?',
      a: 'Yes. Add fuel, tolls, cleaning, licensing, parking fines or anything else your fleet spends on, with a name, icon and colour. Charts, breakdowns and exports all follow your categories.',
    },
    {
      q: 'Does Rovora connect to Xero or QuickBooks?',
      a: 'It exports a CSV in the layout Xero and QuickBooks import, with one line per real transaction. It does not sync automatically yet; a direct connection is on the roadmap.',
    },
    {
      q: 'How do recurring costs like a lease work?',
      a: 'Enter the cost once against the vehicle, with how often it is due. Rovora posts a line on each due date, marked “Auto”, and lists the upcoming ones on the Bookkeeping page so nothing arrives as a surprise.',
    },
    {
      q: 'Can I see the profit for one specific car?',
      a: 'Tag income and expense lines to the vehicle when you add them, then filter the ledger to that car for any period. Recurring costs set up on a vehicle are tagged to it automatically.',
    },
    {
      q: 'Who can see the books?',
      a: 'Fleet admins only. Drivers and office staff without admin rights do not see the Bookkeeping page.',
    },
  ],
  related: ['/features/settlements', '/features/maintenance', '/for/small-fleets'],

  cta: {
    title: 'Put today’s receipt in today.',
    body: 'Get your {free} free, no card. Add your first expense from your phone in under a minute.',
  },
};
