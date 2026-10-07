import { permanentRedirect } from 'next/navigation';

/**
 * /docs has only one thing under it today. Redirecting keeps a guessed URL
 * useful instead of answering a 404, and leaves room for more docs later.
 */
export default function DocsIndex() {
  // Permanent (308), so search engines pass any link value on to /docs/api.
  permanentRedirect('/docs/api');
}
