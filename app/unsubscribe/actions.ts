'use server';

import { redirect } from 'next/navigation';
import { recordUnsubscribe, removeUnsubscribe, verifyUnsubscribe } from '@/lib/email/unsubscribe';

/**
 * Form actions for /unsubscribe. Both re-verify the signed link before
 * touching anything, so the page can't be used to change someone else's
 * preferences.
 */
function back(u: string, t: string, done: 'unsub' | 'resub' | 'error'): never {
  redirect(`/unsubscribe?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}&done=${done}`);
}

export async function unsubscribeAction(formData: FormData) {
  const u = String(formData.get('u') ?? '');
  const t = String(formData.get('t') ?? '');
  const email = verifyUnsubscribe(u, t);
  if (!email) back(u, t, 'error');
  back(u, t, (await recordUnsubscribe(email, 'link')) ? 'unsub' : 'error');
}

export async function resubscribeAction(formData: FormData) {
  const u = String(formData.get('u') ?? '');
  const t = String(formData.get('t') ?? '');
  const email = verifyUnsubscribe(u, t);
  if (!email) back(u, t, 'error');
  back(u, t, (await removeUnsubscribe(email)) ? 'resub' : 'error');
}
