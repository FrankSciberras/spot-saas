/**
 * Largest receipt (photo or PDF) a bookkeeping line accepts.
 *
 * The file travels inside a Server Action request, and those are capped at 8 MB
 * in next.config.js (`serverActions.bodySizeLimit`). The cap here has to sit
 * under that with room for the form wrapping around the file. It used to be
 * 10 MB, which could never arrive: an 8–10 MB photo was rejected by the
 * framework before the action ran, and the save ended on the error screen.
 * The form checks this before uploading; the action checks it again.
 */
export const RECEIPT_MAX_BYTES = 7 * 1024 * 1024;

/** The same limit, as shown to people. */
export const RECEIPT_MAX_LABEL = '7 MB';
