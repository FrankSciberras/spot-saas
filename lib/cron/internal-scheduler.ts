// =============================================================================
// INTERNAL SCHEDULER — minute-level jobs inside the Next.js server process
// =============================================================================
// GitHub Actions cron (.github/workflows/cron.yml) is fine for daily/hourly
// jobs, but its "every 5 minutes" fired only once or twice an hour, so a
// driver's phone could go silent mid-shift for an hour with nobody told. The
// production server is one long-running container, so a plain timer here is
// both reliable and free. Started from instrumentation.ts (production only).
// =============================================================================

const TRACKING_WATCH_MS = 60_000;

let started = false;

export function startInternalScheduler(): void {
  if (started) return;
  started = true;

  let running = false;
  const tick = async () => {
    if (running) return; // never overlap a slow run
    running = true;
    try {
      const { runTrackingWatch } = await import('@/lib/tracking/watch');
      await runTrackingWatch();
    } catch (err) {
      console.error('[internal-scheduler] tracking watch failed:', err);
    } finally {
      running = false;
    }
  };

  // First run shortly after boot, then every minute. unref() so the timer never
  // keeps a shutting-down process alive.
  setTimeout(() => void tick(), 30_000).unref?.();
  setInterval(() => void tick(), TRACKING_WATCH_MS).unref?.();
  console.log('[internal-scheduler] tracking watch every 60s');
}
