'use server';

// =============================================================================
// DRIVER SELF-SERVICE PROFILE ACTIONS
// =============================================================================
// Lets a driver maintain their OWN contact details. The update runs with the
// RLS client (the caller's session), and the "Drivers update own record" policy
// already restricts the row to user_id = auth.uid(). Crucially we ALSO whitelist
// the columns here: the RLS policy permits a driver to write any column of their
// own row (incl. pay-split fields), so we must never forward arbitrary fields.
// Only safe, driver-owned contact fields are ever written.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';

type Result = { error?: string; ok?: boolean };

const MAX_LEN = 200;

export async function updateMyDriverProfileAction(input: {
  phone?: string | null;
  address?: string | null;
}): Promise<Result> {
  const user = await requireRole(['driver']);

  const clean = (v: string | null | undefined): string | null => {
    if (v === null || v === undefined) return null;
    const trimmed = String(v).trim().slice(0, MAX_LEN);
    return trimmed.length ? trimmed : null;
  };

  // Strict allowlist — never write anything else (e.g. pay %, status, role).
  const updates: { phone: string | null; address: string | null } = {
    phone: clean(input.phone),
    address: clean(input.address),
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from('drivers')
    .update(updates)
    .eq('user_id', user.id); // RLS also pins this to the caller's own record.

  if (error) {
    console.error('updateMyDriverProfileAction failed:', error);
    return { error: 'Could not save your details. Please try again.' };
  }

  revalidatePath('/driver/profile');
  return { ok: true };
}
