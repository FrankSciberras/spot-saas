import { NextResponse } from 'next/server';

/**
 * GET /api/push/vapid-key
 * Get the public VAPID key for push notifications
 */
export async function GET() {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  if (!vapidPublicKey) {
    return NextResponse.json({ 
      error: 'Push notifications not configured',
      configured: false,
    }, { status: 503 });
  }

  return NextResponse.json({ 
    vapidPublicKey,
    configured: true,
  });
}
