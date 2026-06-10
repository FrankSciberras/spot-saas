'use server';

// =============================================================================
// FLEET TOUR — mark "seen" (per user, server-side)
// =============================================================================
// Persists that the signed-in user has seen the fleet onboarding tour, so it
// only ever shows once (the first time they sign in) rather than on every login
// / new browser. Writes once: only sets the timestamp if it's still null.
// =============================================================================

import { createClient, createAdminClient } from '@/lib/supabase/server';

export async function markFleetTourCompletedAction(): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('users')
    .update({ fleet_tour_completed_at: new Date().toISOString() })
    .eq('id', user.id)
    .is('fleet_tour_completed_at', null); // first time only — don't overwrite

  if (error) {
    console.error('markFleetTourCompletedAction failed:', error);
    return { error: 'Could not save tour state.' };
  }
  return { ok: true };
}
