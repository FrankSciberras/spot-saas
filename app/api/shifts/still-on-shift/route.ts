import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { confirmStillOnShift } from '@/lib/shifts/shift-check';

/**
 * POST /api/shifts/still-on-shift — the driver opened the app/portal, so
 * they're still working: answers a pending "Are you still on shift?" for their
 * open shift (lib/shifts/shift-check). { confirmed } says whether one was
 * pending. Called by components/driver/ShiftCheckConfirmer.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await confirmStillOnShift(user.id));
  } catch (e) {
    console.error('still-on-shift failed:', e);
    return NextResponse.json({ confirmed: false });
  }
}
