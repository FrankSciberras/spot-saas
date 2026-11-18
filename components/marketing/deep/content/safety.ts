import type { DeepContent } from '../types';

export const SAFETY: DeepContent = {
  path: '/features/safety',
  crumb: { parent: { name: 'Features', path: '/#features' }, name: 'Driver safety' },
  eyebrow: 'Driver safety',
  title: 'See how your cars are driven,',
  accent: 'event by event, on the map.',
  sub: 'Harsh braking, hard acceleration, sharp cornering and speeding, picked up by the phone the driver already carries. Each driver gets a score out of 100, and every event behind it can be opened and looked at.',
  proof: [
    'No hardware to fit',
    'A 0–100 score per driver',
    'Every event on a map',
    'Weekly report to admins',
  ],
  mock: {
    path: 'safety',
    title: 'Safety · last 7 days',
    pill: 'Fleet score 88',
    rows: [
      { name: 'Maria C.', meta: '412 km · 1 event', amt: '97', st: 'Good' },
      { name: 'Joseph B.', meta: '655 km · 6 events', amt: '84', st: 'Fair', idle: true },
      { name: 'Karl M.', meta: '380 km · 11 events', amt: '62', st: 'Needs attention', idle: true },
      { name: 'Harsh braking', meta: 'Triq il-Kbira · 52 → 18 km/h', st: 'Open event' },
    ],
  },

  audienceTitle: 'Who uses safety scores',
  audience: [
    {
      who: 'Owners paying for the repairs',
      situation:
        'The same car keeps coming back with worn brakes and tyres, and you have a feeling about who is driving it but nothing you can point to.',
      gets: 'A count of harsh events per driver, per distance driven, and each one on the map with the time, the speed and the car.',
    },
    {
      who: 'Managers handling a complaint',
      situation:
        'A passenger says the driver was reckless on Tuesday evening. The driver says it was a normal trip.',
      gets: 'The events from that shift, with the route a few minutes either side, so the conversation starts from what happened.',
    },
    {
      who: 'Fleets that want to reward good driving',
      situation:
        'You would like to give your most careful drivers the newer cars or a bonus, but “careful” has always been an opinion.',
      gets: 'A score that is worked out the same way for everyone and adjusted for how far each person drives.',
    },
  ],

  painsTitle: 'What you cannot see from the office',
  pains: [
    {
      title: 'Wear shows up as a garage bill',
      body: 'Brake pads, tyres and clutches go faster under a heavy foot. By the time the invoice arrives, three different people have driven the car.',
    },
    {
      title: 'A complaint is one word against another',
      body: 'Without a record of the trip, you settle it on who you believe, which is unfair to a good driver and too easy on a bad one.',
    },
    {
      title: 'Speeding only reaches you as a fine',
      body: 'A ticket turns up weeks later, addressed to the owner of the car. You then have to work out who had it that night.',
    },
    {
      title: 'More kilometres look like worse driving',
      body: 'Counting raw incidents punishes whoever works the most. A driver doing 900 km a week will always have more events than one doing 90.',
    },
  ],

  stepsKicker: 'How it works',
  stepsTitle: 'From a hard brake to a conversation',
  stepsIntro: 'Nothing is fitted to the car. Detection runs in the Rovora Driver app while a driver is on shift and sharing location.',
  steps: [
    {
      title: 'The driver starts a shift',
      body: 'Location sharing starts with the shift and stops when it ends. While it runs, the app also watches the phone’s motion sensors.',
    },
    {
      title: 'The phone notices a harsh event',
      body: 'A hard brake, a hard acceleration or a sharp corner is recorded with its strength and direction. Potholes and speed bumps are filtered out, and so is the driver picking the phone up.',
    },
    {
      title: 'The exact spot is captured',
      body: 'For a few seconds after each event the app takes precise positions, so the event has an exact location, the speed before and after, and a short trail.',
    },
    {
      title: 'Speeding is checked against your limit',
      body: 'You set one speed limit for the fleet. Going over it is logged as a speeding event for that driver.',
    },
    {
      title: 'Each driver gets a score',
      body: 'Events are weighted, speeding counting most, and divided by the distance driven, giving a score from 0 to 100. 90 and above reads “Good”, 70 and above “Fair”, below that “Needs attention”.',
    },
    {
      title: 'You open the ones that matter',
      body: 'Click a driver to see every event over the last 7 days or 4 weeks: on a map, with the route around it, the street name, the car and the shift, and links to Google Maps and Street View.',
    },
  ],

  includedTitle: 'Everything in Safety',
  included: [
    { icon: 'gauge', title: 'A score per driver', body: '0 to 100, adjusted for distance so busy drivers are not penalised for driving more.' },
    { icon: 'pulse', title: 'Four kinds of event', body: 'Harsh braking, hard acceleration, sharp cornering and speeding.' },
    { icon: 'car', title: 'Event detail', body: 'Map, route a few minutes either side, speed before and after, strength, duration, car and shift.' },
    { icon: 'shield', title: 'Where events happen', body: 'A fleet-wide map of the places your drivers brake or corner hard most often.' },
    { icon: 'file', title: 'Street names', body: 'Each event is labelled with the street it happened on, with links to Google Maps and Street View.' },
    { icon: 'bell', title: 'Weekly report', body: 'A safety report for admins each week, so you do not have to remember to look.' },
    { icon: 'sliders', title: 'Your speed limit', body: 'One fleet-wide limit that you set, used for speeding events and alerts.' },
    { icon: 'calendar', title: '7 days or 4 weeks', body: 'Switch the period to see whether a driver is improving.' },
    { icon: 'phone', title: 'Runs on the phone', body: 'Detection is part of the Rovora Driver app for Android. No box, no installer, no SIM.' },
  ],

  limits: [
    {
      title: 'It relies on the driver’s phone',
      body: 'Events are detected by the phone, on shift, with the app sharing location. A phone left at home, switched off or with location blocked records nothing. The live map tells you which on-shift drivers are not sharing, and why.',
    },
    {
      title: 'It is not a dashcam',
      body: 'There is no video. You get where, when, how hard and how fast, which is usually enough to have the conversation, but it will not show you what was in front of the car.',
    },
    {
      title: 'No engine or fuel data',
      body: 'Harsh events are detected by the phone, not by the car. GPS trackers you connect add each car’s position to the live map, but Rovora does not read fault codes, fuel levels or idling figures.',
    },
    {
      title: 'One speed limit, not a limit per road',
      body: 'Speeding is measured against the single limit you set for the fleet. It does not know that a particular street is a 30 zone.',
    },
  ],

  faq: [
    {
      q: 'Do I need to install anything in the cars?',
      a: 'No. Harsh events are detected by the Rovora Driver app on the driver’s Android phone, using the phone’s own motion sensors and GPS. There is nothing to fit and nothing to buy.',
    },
    {
      q: 'How is the safety score calculated?',
      a: 'Each event carries a weight, with speeding weighing the most, then harsh braking, then acceleration and cornering. The weighted total is divided by the distance driven and taken off 100. A driver with no events over the period scores 100.',
    },
    {
      q: 'Will a pothole or a speed bump count as harsh braking?',
      a: 'No. The app looks at horizontal force only, so vertical jolts from potholes and bumps are ignored. Moments where the phone itself was tilted or picked up are also thrown away.',
    },
    {
      q: 'Is it fair to drivers who work more hours?',
      a: 'Yes. The score is per distance driven, not a raw count, so someone covering 900 km a week is measured on the same scale as someone covering 90.',
    },
    {
      q: 'Can drivers be tracked when they are off shift?',
      a: 'No. Location sharing and event detection run during shifts only. When the shift ends, both stop.',
    },
    {
      q: 'Does it work on iPhone?',
      a: 'Harsh-event detection is part of the Rovora Driver app, which is on Google Play for Android today. An iPhone app is on the roadmap.',
    },
  ],
  related: ['/features/live-tracking', '/features/driver-app', '/features/damage'],

  cta: {
    title: 'Find out who is hard on your cars.',
    body: 'Get your {free} free, no card. Scores start building from your drivers’ first shift.',
  },
};
