/**
 * Errors that are not bugs in a page, and that loading the page again fixes.
 *
 * Shared by the two error boundaries (app/error.tsx and app/global-error.tsx).
 * Both need it: which one catches a failed navigation depends on how far the
 * download got before it broke, so handling it in only one of them still left
 * people on an error screen.
 */

const REFRESH_KEY = 'error_page_refresh';
/** A second failure this soon after an automatic reload is shown, not reloaded. */
const REFRESH_GUARD_MS = 15000;

/**
 * A JS/CSS chunk failed to load. In practice: a tab opened before a deploy
 * navigates to a page whose files belong to the previous build, which the new
 * container no longer has. The bundler caches the failed load, so "Try again"
 * (reset) can never succeed. Only a full reload, which picks up the new build,
 * fixes it.
 */
export function isChunkLoadError(error: Error): boolean {
  return (
    error.name === 'ChunkLoadError' ||
    /Failed to load chunk|Loading (CSS )?chunk|dynamically imported module|Importing a module script failed/i.test(
      error.message ?? '',
    )
  );
}

/**
 * The connection dropped while page data was still downloading. Seen in
 * production as `ERR_QUIC_PROTOCOL_ERROR` (an HTTP/3 connection dying
 * mid-response) followed by "TypeError: network error" when moving between
 * dashboard pages; the heavier pages hit it most. The page itself is fine, so
 * loading it again works, and after a failed HTTP/3 connection the browser
 * retries over a regular one. The wording differs per browser: Chrome says
 * "network error", Safari "Load failed", Firefox "NetworkError when…" or
 * "Error in input stream". "Connection closed." is React's own message when
 * the page data ends early without a network error being reported; production
 * builds of React shorten it to "Minified React error #412".
 */
export function isConnectionError(error: Error): boolean {
  return /^network error$|^Connection closed\.?$|Minified React error #412\b|Load failed|NetworkError|Error in input stream|ERR_QUIC|ERR_CONNECTION|ERR_NETWORK/i.test(
    (error.message ?? '').trim(),
  );
}

/** Errors a single automatic reload fixes, with no need to make the user wait. */
export function isReloadableNow(error: Error): boolean {
  return isChunkLoadError(error) || isConnectionError(error);
}

/** Did an automatic reload already happen moments ago? Stops reload loops. */
export function recentlyRefreshed(): boolean {
  try {
    const last = sessionStorage.getItem(REFRESH_KEY);
    return !!last && Date.now() - parseInt(last, 10) < REFRESH_GUARD_MS;
  } catch {
    // Storage blocked: we can't tell, so don't risk a loop.
    return true;
  }
}

/** Record that an automatic reload is about to happen. */
export function markRefreshed(): void {
  try {
    sessionStorage.setItem(REFRESH_KEY, Date.now().toString());
  } catch {
    /* storage blocked */
  }
}
