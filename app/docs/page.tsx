import { redirect } from 'next/navigation';

/**
 * /docs has only one thing under it today. Redirecting keeps a guessed URL
 * useful instead of answering a 404, and leaves room for more docs later.
 */
export default function DocsIndex() {
  redirect('/docs/api');
}
