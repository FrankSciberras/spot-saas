import type { DeepContent } from '../types';

export const MESSAGES: DeepContent = {
  path: '/features/messages',
  crumb: { parent: { name: 'Features', path: '/#features' }, name: 'Driver messaging' },
  eyebrow: 'Driver messaging',
  title: 'Talk to your drivers',
  accent: 'without the WhatsApp group.',
  sub: 'One-to-one chats, groups and announcements inside Rovora, with the same people who are actually in your fleet today. When a driver leaves, they leave the chat too.',
  proof: [
    'Direct chats, groups and announcements',
    'Photos and files up to 15 MB',
    'Read receipts',
    'Drivers join and leave with the fleet',
  ],
  mock: {
    path: 'messages',
    title: 'Messages',
    pill: '3 unread',
    rows: [
      { name: 'Everyone', meta: 'Airport road closed after 22:00 tonight', st: 'Announcement' },
      { name: 'Night shift', meta: 'Maria: car 4 needs a wash before 6', st: '2 new', idle: true },
      { name: 'Joseph B.', meta: 'Photo · fuel receipt', st: 'Seen' },
      { name: 'Karl M.', meta: 'Can I swap Thursday for Friday?', st: '1 new', idle: true },
    ],
  },

  audienceTitle: 'Who uses Messages',
  audience: [
    {
      who: 'Owners running the fleet from a phone',
      situation:
        'Your work chat is a WhatsApp group that still has two drivers who left last year, mixed in with your family chats and everything else.',
      gets: 'A work inbox that only has work in it, with exactly the people who drive for you now.',
    },
    {
      who: 'Office staff and dispatchers',
      situation:
        'You need to tell twelve drivers about a road closure, and you need to know who has actually read it before the night shift starts.',
      gets: 'An announcement group only managers can post in, and a “Seen” mark on what you send.',
    },
    {
      who: 'Drivers',
      situation:
        'You want to send a photo of a receipt or ask about a shift without giving your personal number to everyone in a group.',
      gets: 'A Messages tab in the app they already use to start their shift, with the fleet’s managers one tap away.',
    },
  ],

  painsTitle: 'A WhatsApp group was never built to run a fleet',
  painsIntro: 'It works when you have three drivers. It stops working quietly, and you only notice when something goes wrong.',
  pains: [
    {
      title: 'People who left can still read everything',
      body: 'Nobody remembers to remove a driver from the group on their last day. Rosters, plate numbers and who is working when keep landing on the phone of someone who no longer works for you.',
    },
    {
      title: 'The important message is 40 messages up',
      body: 'A notice about a document deadline is buried under good-morning stickers by lunchtime. You end up phoning each driver anyway.',
    },
    {
      title: 'Everybody has everybody’s number',
      body: 'A group chat hands every driver’s personal phone number to every other driver, whether they wanted that or not.',
    },
    {
      title: 'It lives on one person’s phone',
      body: 'The history of what was agreed with a driver sits in the owner’s personal WhatsApp. When someone else takes over the desk, they start from nothing.',
    },
  ],

  stepsKicker: 'How it’s used',
  stepsTitle: 'A normal week in Messages',
  stepsIntro: 'Nothing to set up. The day Messages is switched on, every fleet has an “Everyone” group with the people who are in the fleet right now.',
  steps: [
    {
      title: 'A new driver joins the fleet',
      body: 'You add them to Rovora as usual. They appear in the “Everyone” group on their own, and they can message the fleet’s managers straight away. No invite link to send, no group to add them to.',
    },
    {
      title: 'You post a notice to everybody',
      body: 'Create an announcement group, where only managers can post, and write the notice once. Drivers see it with an unread badge in their app, and under your message you watch “Seen by 4” turn into “Seen by everyone”.',
    },
    {
      title: 'A driver sends you a photo',
      body: 'A fuel receipt, a scratch on a bumper, a parking ticket. Photos and files up to 15 MB go straight into the chat with you, and stay there when you need to find them again.',
    },
    {
      title: 'You make a group for the night shift',
      body: 'Pick the drivers, name the group, done. Use it for the things only those four people need to know, so the rest of the fleet is not interrupted.',
    },
    {
      title: 'Somebody sends something to the wrong chat',
      body: 'Delete it for everyone. It disappears from every phone, not just yours.',
    },
    {
      title: 'A driver leaves',
      body: 'Remove them from the fleet and they are out of every chat at the same moment. There is no second step to forget.',
    },
  ],

  includedTitle: 'Everything in Messages',
  included: [
    { icon: 'send', title: 'Direct chats', body: 'One-to-one between a driver and the fleet’s managers. You decide whether drivers can also message each other.' },
    { icon: 'users', title: 'Groups', body: 'Managers create groups for a shift, a depot or a set of cars, and choose who is in them.' },
    { icon: 'bell', title: 'Announcement groups', body: 'Only managers can post. For notices that should not turn into a conversation.' },
    { icon: 'camera', title: 'Photos and files', body: 'Up to 15 MB each. Stored privately and only shown to people in that chat.' },
    { icon: 'check', title: 'Read receipts', body: '“Seen” in a direct chat, “Seen by 7” or “Seen by everyone” in a group, and unread badges in the sidebar, top bar and the driver’s tabs.' },
    { icon: 'shield', title: 'Membership follows the fleet', body: 'The “Everyone” group is kept in step with who is in your fleet. Leaving the fleet means leaving its chats.' },
    { icon: 'phone', title: 'In the driver app', body: 'Messages is a tab in Rovora Driver. Tapping a message notification opens that chat.' },
    { icon: 'minusCircle', title: 'Mute and delete', body: 'Mute a busy group without leaving it, or delete a message for everyone.' },
    { icon: 'sliders', title: 'Switch it off', body: 'Messages is a module. If your fleet does not want it, turn it off and it disappears from every menu.' },
  ],

  limits: [
    {
      title: 'No voice or video calls',
      body: 'Messages is text, photos and files. To call a driver you still pick up the phone.',
    },
    {
      title: 'Phone push for drivers is still being rolled out',
      body: 'Managers get browser notifications today. On drivers’ phones the app checks for unread messages in the background and shows a badge; instant push notifications to the driver app are next on the roadmap.',
    },
    {
      title: 'It does not send to WhatsApp',
      body: 'Messages stay inside Rovora. Sending reminders to drivers on WhatsApp is a separate integration that is not live yet.',
    },
    {
      title: 'Drivers need a Rovora login',
      body: 'A chat is between people in your fleet. You cannot message a customer or someone who has not joined the fleet.',
    },
  ],

  faq: [
    {
      q: 'Can drivers message each other, or only the office?',
      a: 'That is your choice. By default a driver can message the fleet’s managers. A setting lets you allow direct chats between drivers as well, and you can turn it back off at any time.',
    },
    {
      q: 'What happens to the chats when a driver leaves the fleet?',
      a: 'They lose access to the fleet’s chats at the same moment they are removed from the fleet, including the “Everyone” group. Your side of the history stays where it was.',
    },
    {
      q: 'Can drivers see each other’s phone numbers?',
      a: 'No. People appear in chats by name. Nobody’s personal number is shared by being in a group, which is one of the main differences from a WhatsApp group.',
    },
    {
      q: 'Do drivers have to install another app?',
      a: 'No. Messages is a tab inside Rovora Driver, the same app they use to start a shift and see their roster and pay. It also works in the browser.',
    },
    {
      q: 'Can I see who has read an announcement?',
      a: 'Yes. In a group, your message shows “Seen by 7” and then “Seen by everyone” as people read it. In a one-to-one chat it shows “Seen”.',
    },
    {
      q: 'Is Messages included in my plan?',
      a: 'Messages is switched on by default for every fleet and can be turned off under Apps & modules. There is no per-message or per-driver charge.',
    },
  ],
  related: ['/features/driver-app', '/features/rosters', '/for/small-fleets'],

  cta: {
    title: 'Move the fleet chat out of your personal WhatsApp.',
    body: 'Get your {free} free, no card. Your drivers are in the “Everyone” group as soon as you add them.',
  },
};
