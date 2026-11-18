import type { DeepContent } from '../types';

export const DRIVER_APP: DeepContent = {
  path: '/features/driver-app',
  crumb: { parent: { name: 'Features', path: '/#features' }, name: 'Driver app' },
  eyebrow: 'Rovora Driver · free for every driver',
  title: 'The driver’s side of the fleet,',
  accent: 'on the phone they already have.',
  sub: 'Drivers start and end shifts, complete their checks, see the roster and their pay, and message the office from one app. You get the odometer readings, the hours and the live position without asking for them.',
  proof: [
    'Free for every driver',
    'Android app on Google Play',
    'Also works in any browser',
    'Location shared during shifts only',
  ],
  mock: {
    path: 'driver',
    title: 'Good morning, Joseph',
    pill: 'On shift · 3h 12m',
    rows: [
      { name: 'Today', meta: 'Car 4 · started 06:02', st: 'Sharing location' },
      { name: 'Roster', meta: 'Thu day shift · Car 4', st: 'Published' },
      { name: 'Last week', meta: 'settlement ready', amt: '€412.60', st: 'Owed to you' },
      { name: 'Messages', meta: 'Office: airport road closed after 22:00', st: '1 new', idle: true },
    ],
  },

  audienceTitle: 'Who it’s built for',
  audience: [
    {
      who: 'Drivers',
      situation:
        'You want to know when you are working, which car you have, and what you are owed this week, without phoning the office to ask.',
      gets: 'Roster, shifts, earnings and each week’s settlement in one place, with the PDF of what is owed to you.',
    },
    {
      who: 'Owners and managers',
      situation:
        'You rely on drivers texting you the odometer reading and telling you when they have started, and half the time they forget.',
      gets: 'A shift cannot start without the car, the odometer reading and the pre-shift checks, so the record is complete every time.',
    },
    {
      who: 'Fleets with cars that change hands',
      situation:
        'The same car is driven by two or three people in a day, and when something turns up you need to know who had it.',
      gets: 'Every shift is tied to one driver and one car, with the kilometres driven worked out from the readings at each end.',
    },
  ],

  stepsKicker: 'A shift, from the driver’s side',
  stepsTitle: 'What a driver actually does in the app',
  stepsIntro: 'If someone can use a ride-hailing app, they can use this. There is nothing to train.',
  steps: [
    {
      title: 'Sign in once',
      body: 'You add the driver in Rovora with their email address. They sign in on the app or in a browser, and the app remembers them from then on.',
    },
    {
      title: 'Start the shift',
      body: 'Pick the car, enter the odometer reading, confirm the dashcam and interior checks, and add photos of the car if anything needs recording. One tap starts the shift and the live location with it.',
    },
    {
      title: 'Drive',
      body: 'The app shares location in the background while the shift is open. If the phone stops it, the app restarts it and reminds the driver. You see them on the live map.',
    },
    {
      title: 'Check the roster and the pay',
      body: 'The published roster shows which days and which car. Earnings and each week’s settlement are there too, including a PDF that leads with the amount owed to the driver.',
    },
    {
      title: 'Message the office',
      body: 'Messages is a tab in the app. A receipt photo, a question about Thursday, a notice from the office to everyone.',
    },
    {
      title: 'End the shift',
      body: 'Enter the closing odometer reading and the shift ends. Location sharing stops with it. If a driver forgets, Rovora asks “Are you still on shift?” after the number of hours you set and ends the shift if there is no answer.',
    },
  ],

  includedTitle: 'Everything drivers get',
  included: [
    { icon: 'clock', title: 'Start and end shifts', body: 'With the car, the odometer at both ends and the pre-shift checks, so every shift has a complete record.' },
    { icon: 'camera', title: 'Vehicle photos', body: 'Photos of each side of the car at the start of a shift, attached to that shift.' },
    { icon: 'calendar', title: 'Roster', body: 'The published roster for the week, and a notification when it changes.' },
    { icon: 'coins', title: 'Earnings and settlements', body: 'What they earned, what was deducted and what they are owed, week by week, with the PDF.' },
    { icon: 'send', title: 'Messages', body: 'Direct chats with the office, groups and announcements.' },
    { icon: 'pulse', title: 'Live location on shift', body: 'Shared in the background while a shift is open, and switched off when it ends.' },
    { icon: 'car', title: 'Vehicles', body: 'The fleet’s cars, with their own listed first.' },
    { icon: 'user', title: 'Profile and documents', body: 'Drivers update their own contact details and upload their documents from the phone.' },
    { icon: 'bell', title: 'Notifications', body: 'Roster changes, reminders and messages, in one list.' },
  ],

  limits: [
    {
      title: 'The app is Android only for now',
      body: 'Rovora Driver is on Google Play. An iPhone app is on the roadmap. Until then, drivers on iPhone use Rovora in the browser for shifts, rosters, pay and messages.',
    },
    {
      title: 'Dependable live tracking needs the Android app',
      body: 'Background location, automatic restarts and harsh-driving detection are things only the app can do. A driver using the website instead will show up on your live map’s “not sharing” list with that as the reason.',
    },
    {
      title: 'It is not a booking or dispatch app',
      body: 'Drivers do not receive jobs through Rovora. They keep taking rides on Bolt, Uber, eCabs or your own desk. Rovora runs the shift around the rides.',
    },
    {
      title: 'Drivers do not enter their own earnings',
      body: 'What a driver is owed comes from the weekly settlement the fleet prepares. The app shows it to them; it does not ask them for it.',
    },
  ],

  faq: [
    {
      q: 'Is the driver app free?',
      a: 'Yes. The app is free for drivers and there is no charge per driver. Rovora is priced per vehicle; each plan allows as many drivers as it allows vehicles.',
    },
    {
      q: 'Do my drivers need a special phone or a tracker?',
      a: 'No. The app runs on an ordinary Android phone, and the live map uses the phone’s own GPS. There is no device to fit to the car.',
    },
    {
      q: 'Can drivers be tracked when they are not working?',
      a: 'No. Location sharing starts when a shift starts and stops when it ends. Outside a shift the app does not send location.',
    },
    {
      q: 'What happens if a driver forgets to end their shift?',
      a: 'You choose after how many hours Rovora asks “Are you still on shift?”, and how long the driver has to answer. With no answer, the shift is ended at the moment the question was asked, so the hours stay honest.',
    },
    {
      q: 'What if a driver switches location off or the app stops sharing?',
      a: 'The app reminds on-shift drivers who are not sharing and restarts sharing when the phone has stopped it. On your live map, an “On shift, not sharing location” box lists each driver with the specific reason and what to tell them.',
    },
    {
      q: 'Can a driver see other drivers’ pay?',
      a: 'No. A driver sees their own shifts, earnings and settlements only.',
    },
    {
      q: 'Does it work on iPhone?',
      a: 'The app is on Google Play today, and an iPhone app is on the roadmap. iPhone drivers can sign in through the browser for shifts, rosters, pay and messages, but background location needs the Android app.',
    },
  ],
  related: ['/features/live-tracking', '/features/messages', '/features/rosters'],

  cta: {
    title: 'Give your drivers one app instead of five chats.',
    body: 'Get your {free} free, no card. Add a driver and they can start their first shift today.',
  },
};
