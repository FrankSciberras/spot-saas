import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");

    // Minute-level background jobs (tracking watch) in the live server only —
    // never during `next build` or local dev. Set DISABLE_INTERNAL_CRON=1 to
    // turn off, e.g. if the app is ever scaled to several containers.
    if (
      process.env.NODE_ENV === "production" &&
      process.env.NEXT_PHASE !== "phase-production-build" &&
      process.env.DISABLE_INTERNAL_CRON !== "1"
    ) {
      const { startInternalScheduler } = await import("./lib/cron/internal-scheduler");
      startInternalScheduler();
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
