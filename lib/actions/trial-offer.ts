'use server';

// =============================================================================
// PLATFORM-ADMIN — FREE-TRIAL OFFER
// =============================================================================
// Saves the trial length new sign-ups get, and an optional time-limited
// campaign (see lib/billing/trial-offer). Platform admin only. Changing it never
// touches fleets that already exist — they keep the trial they signed up with.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requirePlatformAdmin } from '@/lib/auth/platform';
import {
  MAX_TRIAL_DAYS,
  MIN_TRIAL_DAYS,
  isValidDay,
  normalizeTrialOffer,
  todayForOffers,
  type TrialOffer,
} from '@/lib/billing/trial-offer';
import { PLATFORM_SETTINGS_ORG, TRIAL_OFFER_KEY } from '@/lib/billing/trial-offer-data';

function validDays(n: unknown): boolean {
  return Number.isInteger(n) && (n as number) >= MIN_TRIAL_DAYS && (n as number) <= MAX_TRIAL_DAYS;
}

export async function saveTrialOfferAction(
  input: TrialOffer
): Promise<{ error?: string; ok?: boolean; offer?: TrialOffer }> {
  await requirePlatformAdmin();

  if (!validDays(input?.standardDays)) {
    return { error: `The standard trial must be between ${MIN_TRIAL_DAYS} and ${MAX_TRIAL_DAYS} days.` };
  }
  if (input.promo) {
    if (!validDays(input.promo.days)) {
      return { error: `The campaign trial must be between ${MIN_TRIAL_DAYS} and ${MAX_TRIAL_DAYS} days.` };
    }
    if (input.promo.endsOn) {
      if (!isValidDay(input.promo.endsOn)) return { error: 'Pick a valid end date for the campaign.' };
      if (input.promo.endsOn < todayForOffers()) {
        return { error: 'That end date has already passed — pick today or a later day.' };
      }
    }
  }

  const offer = normalizeTrialOffer(input);
  const admin = createAdminClient();
  const { error } = await admin.from('app_settings').upsert(
    {
      organization_id: PLATFORM_SETTINGS_ORG,
      key: TRIAL_OFFER_KEY,
      value: offer,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,key' }
  );

  if (error) {
    console.error('saveTrialOfferAction failed:', error);
    return { error: 'Could not save the trial offer.' };
  }

  // The offer is printed across the marketing site, onboarding and the chat
  // assistant — refresh every cached page so the new wording shows straight away.
  revalidatePath('/', 'layout');
  return { ok: true, offer };
}
