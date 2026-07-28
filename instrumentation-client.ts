// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

/**
 * Routes that make up the signed-in app. Session Replay and tracing are only
 * worth their weight here.
 *
 * Statically referencing `Sentry.replayIntegration()` pulled rrweb into the root
 * chunk that every route loads — 546 KiB raw, over half of all the JavaScript on
 * a marketing page, for anonymous visitors who will never be replayed. Loading
 * it behind a dynamic import keeps it out of the marketing bundle. It comes from
 * our own bundle rather than `lazyLoadIntegration()`, which fetches from
 * browser.sentry-cdn.com and would be blocked by exactly the ad-blockers that
 * `tunnelRoute: "/monitoring"` in next.config.js exists to work around.
 */
const APP_ROUTE = /^\/(fleet|driver|admin|onboarding|billing|staff|dashboard)(\/|$)/;

const isAppRoute = () =>
  typeof window !== "undefined" && APP_ROUTE.test(window.location.pathname);

Sentry.init({
  dsn: "https://314a90ea8ec2883621bab55f19ccc5f0@o4510936404983808.ingest.de.sentry.io/4510936415535184",

  // Replay is added below, on app routes only. This array merges with the SDK's
  // defaults — it does not disable them.
  integrations: [],

  // Full tracing inside the app, none on public marketing pages: a landing page
  // does not need a performance beacon on every visit.
  tracesSampler: () => (isAppRoute() ? 1 : 0),

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Off by default: Session Replay records real screens, and neither
  // app/privacy nor app/security currently discloses that we attach personal
  // data to error reports. Turn back on only alongside that disclosure.
  sendDefaultPii: false,
});

// Attach Replay once, and only for the authenticated app.
let replayAttached = false;
function attachReplayOnAppRoutes() {
  if (replayAttached || !isAppRoute()) return;
  replayAttached = true;
  void import("@sentry/nextjs").then((S) => {
    Sentry.addIntegration(S.replayIntegration());
  });
}

attachReplayOnAppRoutes();

export function onRouterTransitionStart(
  ...args: Parameters<typeof Sentry.captureRouterTransitionStart>
) {
  // A visitor who lands on marketing and then navigates into the app still gets
  // Replay from that point on, not only when the app is the entry page.
  attachReplayOnAppRoutes();
  return Sentry.captureRouterTransitionStart(...args);
}
