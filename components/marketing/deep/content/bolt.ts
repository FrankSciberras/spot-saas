import type { DeepContent } from '../types';

export const BOLT: DeepContent = {
  path: '/features/bolt',
  crumb: { parent: { name: 'Features', path: '/#features' }, name: 'Bolt integration' },
  eyebrow: 'Bolt integration · Live',
  title: 'Your Bolt fleet,',
  accent: 'next to everything else you run.',
  sub: 'Connect your Bolt fleet account with an API key and Rovora brings in your Bolt drivers, vehicles and rides, refreshed every hour. Fares, tips, acceptance and who is online, per driver and per car, without opening the Bolt portal.',
  proof: [
    'Refreshes every hour',
    'Read-only: nothing changes in Bolt',
    'Key encrypted before storage',
    'Disconnect at any time',
  ],
  mock: {
    path: 'bolt',
    title: 'Bolt · last 7 days',
    pill: 'Synced 12 min ago',
    rows: [
      { name: 'Rides finished', meta: 'all drivers', amt: '412' },
      { name: 'Ride fares', meta: 'before Bolt’s commission', amt: '€6,180' },
      { name: 'Joseph B.', meta: '96 rides · 91% accepted', amt: '€1,420', st: 'Online' },
      { name: 'Maria C.', meta: '74 rides · 84% accepted', amt: '€1,105' },
      { name: 'Car 7', meta: 'no rides in 5 days', st: 'Idle', idle: true },
    ],
  },

  audienceTitle: 'Who connects Bolt',
  audience: [
    {
      who: 'Fleets earning mostly on Bolt',
      situation:
        'Every Monday you open the Bolt Fleet Portal, export the week, and copy each driver’s figures somewhere you can work with them.',
      gets: 'Each driver’s rides, fares, tips and cash for any period, already matched to the driver in Rovora.',
    },
    {
      who: 'Owners with cars that are not earning',
      situation:
        'You have a feeling two of your cars are sitting still more than they should, but checking means going car by car through the portal.',
      gets: 'A Vehicles tab that lists rides and fares per car and points out the ones that have gone idle.',
    },
    {
      who: 'Managers who coach drivers',
      situation:
        'You want to talk to a driver about declined rides or a slipping rating, and you want the numbers in front of you when you do.',
      gets: 'Acceptance rate, rating, fares per hour and time on jobs for each driver, over the period you pick.',
    },
  ],

  stepsKicker: 'How it works',
  stepsTitle: 'From API key to dashboard',
  stepsIntro: 'Connecting takes a few minutes and you can undo it with one click.',
  steps: [
    {
      title: 'Create a key in the Bolt Fleet Portal',
      body: 'In Bolt, go to Settings → Fleet API keys (v2) and create a key. It is your key, for your Bolt fleet account. Rovora never sees your Bolt password.',
    },
    {
      title: 'Paste it into Rovora',
      body: 'Open Bolt in Rovora and paste the key. It is encrypted before it is stored. A “Bolt” item appears in your sidebar.',
    },
    {
      title: 'Add your whole Bolt fleet in one click',
      body: 'Rovora lists every driver and car on your Bolt account. Import everything, or tick who to add — no typing. Your ride history comes in too, and from then on Rovora checks for new rides every hour.',
    },
    {
      title: 'Drivers are matched for you',
      body: 'Each Bolt driver is matched to the driver in Rovora by email, phone number or name. Where the match is wrong or missing, you pick the right person and Rovora remembers it.',
    },
    {
      title: 'Read the week in five tabs',
      body: 'Overview, Drivers, Revenue, Trips and Vehicles all share one date range, so you set “last week” once and every tab follows.',
    },
    {
      title: 'Change your mind any time',
      body: 'Disconnect and the Bolt item leaves the sidebar, together with the Bolt rides and figures. Drivers and cars you added to Rovora stay yours. Nothing in your Bolt account is touched.',
    },
  ],

  includedTitle: 'What you see once Bolt is connected',
  included: [
    { icon: 'chart', title: 'Overview', body: 'Rides, fares, tips, acceptance, fares per hour and rating for the period, fares by day, and your top drivers.' },
    { icon: 'pulse', title: 'Online right now', body: 'Which of your drivers are online on Bolt at this moment, read live.' },
    { icon: 'users', title: 'Per driver', body: 'A table of every driver’s Bolt figures, each linked to the matching driver in Rovora.' },
    { icon: 'coins', title: 'Revenue', body: 'In-app against cash, fares by day and by hour, payment methods and ride types, plus a day-by-day table.' },
    { icon: 'file', title: 'Every ride offer', body: 'All trips, filterable by outcome and by driver, so you can see what was accepted, declined or cancelled.' },
    { icon: 'car', title: 'Per vehicle', body: 'Rides and fares for each car, cars with no recent rides, and any suspensions Bolt has applied.' },
    { icon: 'shield', title: 'Read-only and encrypted', body: 'Rovora can only read from Bolt. The key is encrypted before it is saved and only fleet admins can connect or disconnect.' },
    { icon: 'bell', title: 'Told when a key stops working', body: 'If Bolt starts refusing your key, admins get a notification instead of a silently stale dashboard.' },
    { icon: 'repeat', title: 'Hourly, by itself', body: 'No exports, no uploads. New rides arrive on their own every hour.' },
  ],

  limits: [
    {
      title: 'It does not fill in settlements yet',
      body: 'Bolt does not share commission or payout figures through its API. Fares are shown before Bolt’s commission, so the weekly settlement figures are still entered from your Bolt statement. We will connect the two as soon as Bolt makes those numbers available.',
    },
    {
      title: 'Uber and FreeNow are not connected yet',
      body: 'Bolt is the first ride-hailing platform we connect directly. Uber is next on the roadmap. Until then, Uber and other earnings go into settlements by hand, each as its own platform.',
    },
    {
      title: 'You need a Bolt fleet account',
      body: 'The key comes from the Bolt Fleet Portal. A single driver account without fleet access cannot create one.',
    },
    {
      title: 'It reads, it never writes',
      body: 'You cannot accept drivers, change vehicles or message drivers on Bolt from Rovora. That stays in the Bolt portal.',
    },
  ],

  faq: [
    {
      q: 'Is it safe to give Rovora my Bolt API key?',
      a: 'The key is encrypted before it is stored, and it only allows reading data from your Bolt fleet account. Rovora cannot change anything in Bolt with it. You can delete the key in the Bolt Fleet Portal or disconnect in Rovora at any time, and both stop the connection.',
    },
    {
      q: 'Does the Bolt connection calculate my driver settlements?',
      a: 'Not yet. Bolt’s API does not include commission or net payout, so Rovora shows fares before commission and cannot work out what you owe each driver from it alone. Settlements are still filled in from your Bolt statement. This is the first thing we will add when Bolt shares those figures.',
    },
    {
      q: 'How often is the Bolt data updated?',
      a: 'Every hour, automatically. The list of who is online on Bolt right now is read live when you open the page.',
    },
    {
      q: 'What if a Bolt driver is not matched to the right person?',
      a: 'Rovora matches on email, phone number and name. On the Drivers tab you can link any Bolt driver to a different Rovora driver by hand, and your choice is kept on every later sync.',
    },
    {
      q: 'What happens to the Bolt data if I disconnect?',
      a: 'It is removed from Rovora, along with the Bolt item in the sidebar. Your drivers, vehicles, settlements and everything else in Rovora stay exactly as they were, and nothing changes on the Bolt side.',
    },
    {
      q: 'Do you support Uber the same way?',
      a: 'Not yet. Uber is on the roadmap, and fleets on the Fleet plan are first in line for it. Today Uber earnings are entered into settlements as their own platform.',
    },
  ],
  related: ['/features/settlements', '/for/bolt-uber-fleets', '/features/live-tracking'],

  cta: {
    title: 'See your Bolt week without the export.',
    body: 'Get your {free} free, no card. Connecting Bolt is optional and takes a few minutes.',
  },
};
