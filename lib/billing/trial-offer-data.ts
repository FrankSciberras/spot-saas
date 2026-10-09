// =============================================================================
// BILLING — FREE-TRIAL OFFER LOADER (server only)
// =============================================================================
// Reads the admin-set trial offer (see ./trial-offer) from app_settings.
//
// Read with the cookie-free public client first, so marketing pages stay
// statically renderable and get the right offer even at build time (migration
// 20261009_trial_offer.sql lets anyone read this one public row). Falls back to
// the service-role client when that row isn't visible — e.g. before the
// migration is applied — and to the default 30-day offer if both fail.
// =============================================================================

import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient, createPublicClient } from '@/lib/supabase/server';
import { DEFAULT_TRIAL_OFFER, normalizeTrialOffer, trialCopy, currentTrialDays, type TrialCopy, type TrialOffer } from './trial-offer';

/** app_settings rows under the bootstrap org are platform-wide configuration. */
export const PLATFORM_SETTINGS_ORG = '00000000-0000-0000-0000-000000000001';
export const TRIAL_OFFER_KEY = 'trial_offer';

async function readOffer(client: SupabaseClient): Promise<TrialOffer | null> {
  const { data, error } = await client
    .from('app_settings')
    .select('value')
    .eq('organization_id', PLATFORM_SETTINGS_ORG)
    .eq('key', TRIAL_OFFER_KEY)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeTrialOffer(data.value) : null;
}

/** The trial offer as the admin last saved it. Cached per request. */
export const getTrialOffer = cache(async (): Promise<TrialOffer> => {
  try {
    const offer = await readOffer(createPublicClient());
    if (offer) return offer;
  } catch {
    // fall through to the service-role read
  }
  try {
    return (await readOffer(createAdminClient())) ?? DEFAULT_TRIAL_OFFER;
  } catch (err) {
    console.error('getTrialOffer failed, using the default trial:', err);
    return DEFAULT_TRIAL_OFFER;
  }
});

/** What a new sign-up gets right now, with ready-made marketing copy. */
export async function getTrialCopy(): Promise<TrialCopy> {
  return trialCopy(await getTrialOffer());
}

/** Trial length (days) to grant a fleet created right now. */
export async function getCurrentTrialDays(): Promise<number> {
  return currentTrialDays(await getTrialOffer());
}
