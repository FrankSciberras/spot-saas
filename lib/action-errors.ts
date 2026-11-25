/**
 * What to tell someone when a Server Action call itself fails, as opposed to
 * returning `{ error }`: the request never reached the server, the server
 * refused it, or the connection dropped before the answer came back.
 *
 * Without a try/catch around the awaited action, that rejection escapes the
 * transition and lands on the full-page error screen, throwing away whatever
 * was typed into the form. Use in the catch block, after `unstable_rethrow(err)`
 * so redirects (e.g. to /login when the session has expired) still work:
 *
 *   try { … await someAction() … }
 *   catch (err) { unstable_rethrow(err); setError(actionFailureMessage(err)); }
 */
export function actionFailureMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : '';
  // The page was loaded before an update and is calling an action the new
  // version no longer has under that name. Only a refresh fixes it.
  if (/was not found on the server/i.test(message)) {
    return 'Rovora was just updated. Refresh the page, then try again.';
  }
  return 'That did not go through. Check your connection and try again.';
}
