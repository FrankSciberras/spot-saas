import { NextResponse } from 'next/server';
import { recordUnsubscribe, verifyUnsubscribe } from '@/lib/email/unsubscribe';
import { appUrl } from '@/lib/urls';

/**
 * RFC 8058 one-click unsubscribe.
 *
 * Campaign emails carry `List-Unsubscribe: <…/api/email/unsubscribe?u=…&t=…>`
 * plus `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. When someone hits
 * the native "Unsubscribe" button in Gmail / Yahoo / Apple Mail, their mail
 * provider POSTs here — no page, no confirmation, no cookies.
 *
 * Only POST unsubscribes. A GET (someone opening the URL, or a link scanner
 * prefetching it) is sent to the confirmation page instead, so a security
 * scanner can never opt a user out by itself.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const email = verifyUnsubscribe(url.searchParams.get('u'), url.searchParams.get('t'));
  if (!email) return NextResponse.json({ error: 'Invalid unsubscribe link.' }, { status: 400 });

  const ok = await recordUnsubscribe(email, 'one_click');
  if (!ok) return NextResponse.json({ error: 'Could not record the unsubscribe.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  // appUrl(), not url.origin: behind the proxy the request URL can carry the
  // container's internal origin.
  const target = new URL('/unsubscribe', appUrl());
  for (const key of ['u', 't']) {
    const v = url.searchParams.get(key);
    if (v) target.searchParams.set(key, v);
  }
  return NextResponse.redirect(target, 303);
}
