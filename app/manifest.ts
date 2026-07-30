import type { MetadataRoute } from 'next';

/**
 * Web app manifest — this is what makes Rovora installable on a phone or
 * desktop, and what the OS reads when the user taps the home-screen icon.
 *
 * `start_url` is the DASHBOARD, not the marketing home page. Someone who has
 * installed the app wants their fleet, not the sales site; /dashboard is the
 * role resolver (admin -> /admin, driver -> /driver, everyone else -> /fleet)
 * and the proxy bounces signed-out hits to /login, so one entry point works
 * for every kind of user.
 *
 * The colours are deliberate:
 *   background_color = the in-app boot splash green, so the OS-drawn splash
 *                      and SplashScreen.module.css are the same flat colour
 *                      and the launch reads as one screen, not two.
 *   theme_color      = the dashboard canvas (--bg-0), which is what sits
 *                      behind the status bar once the app is open.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/dashboard',
    name: 'Rovora Fleet Management',
    short_name: 'Rovora',
    description:
      'Rovora is your true company overview of what happens on the road — fleet management for drivers and administrators.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    // If a browser ever drops `standalone`, degrade to a slim browser chrome
    // rather than all the way back to a normal tab.
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: '#1a8f5a',
    theme_color: '#0a0c11',
    lang: 'en',
    dir: 'ltr',
    categories: ['business', 'productivity', 'utilities'],
    // There is no native app to send installs to — keep them here.
    prefer_related_applications: false,
    icons: [
      {
        src: '/icons/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        // Same artwork: the mark is drawn at 58% on a solid tile
        // (scripts/generate-icons.js), so it survives a circular mask with
        // room to spare.
        src: '/icons/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    // Long-press the home-screen icon. These are the operator's three most
    // frequent destinations; a driver who taps one is redirected to /driver by
    // requireRole, so they degrade safely rather than erroring.
    shortcuts: [
      {
        name: 'Vehicles',
        short_name: 'Vehicles',
        description: 'View and manage your fleet vehicles',
        url: '/fleet/vehicles',
      },
      {
        name: 'Drivers',
        short_name: 'Drivers',
        description: 'View and manage your drivers',
        url: '/fleet/drivers',
      },
      {
        name: 'Shifts',
        short_name: 'Shifts',
        description: 'See who is on shift right now',
        url: '/fleet/shifts',
      },
    ],
  };
}
