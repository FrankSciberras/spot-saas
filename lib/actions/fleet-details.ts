'use server';

// =============================================================================
// FLEET DETAILS ACTIONS — name, business identity and contact info
// =============================================================================
// Only a fleet ADMIN can edit their own fleet. requireRole(['admin']) resolves
// the caller's ACTIVE organization_id, and every write is pinned to that id
// with the service-role client (same pattern as lib/actions/branding.ts).
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';

export interface FleetDetails {
  name: string;
  slug: string;
  legal_name: string | null;
  vat_number: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  website: string | null;
  speed_limit_kmh: number | null;
}

export interface FleetDetailsInput {
  name: string;
  legal_name?: string;
  vat_number?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  website?: string;
  speed_limit_kmh?: string | number | null;
}

type Result = { ok?: boolean; error?: string; details?: FleetDetails };

const clean = (v: unknown, max: number): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, max) : null;
};

/** Current details of the caller's active fleet (admins only). */
export async function getFleetDetailsAction(): Promise<Result> {
  const user = await requireRole(['admin']);
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('organizations')
    .select('name, slug, legal_name, vat_number, contact_email, contact_phone, address, website, speed_limit_kmh')
    .eq('id', user.organization_id)
    .single();
  if (error || !data) return { error: 'Could not load fleet details.' };
  return { ok: true, details: data as FleetDetails };
}

/** Save the fleet's name, business identity and contact details. */
export async function updateFleetDetailsAction(input: FleetDetailsInput): Promise<Result> {
  const user = await requireRole(['admin']);

  const name = clean(input.name, 80);
  if (!name || name.length < 2) return { error: 'Give your fleet a name (at least 2 characters).' };

  const contact_email = clean(input.contact_email, 120);
  if (contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email)) {
    return { error: 'The contact email doesn’t look right.' };
  }

  let website = clean(input.website, 200);
  if (website) {
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
    try {
      const u = new URL(website);
      if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) throw new Error();
    } catch {
      return { error: 'The website address doesn’t look right (e.g. www.yourfleet.com).' };
    }
  }

  let speed_limit_kmh: number | null = null;
  if (input.speed_limit_kmh !== undefined && input.speed_limit_kmh !== null && String(input.speed_limit_kmh).trim() !== '') {
    const n = Number(input.speed_limit_kmh);
    if (!Number.isInteger(n) || n < 20 || n > 200) return { error: 'Speed limit must be a whole number between 20 and 200 km/h.' };
    speed_limit_kmh = n;
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('organizations')
    .update({
      name,
      legal_name: clean(input.legal_name, 160),
      vat_number: clean(input.vat_number, 40),
      contact_email,
      contact_phone: clean(input.contact_phone, 40),
      address: clean(input.address, 400),
      website,
      speed_limit_kmh,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.organization_id);

  if (error) {
    console.error('updateFleetDetailsAction failed:', error);
    return { error: 'Could not save the fleet details.' };
  }

  // The fleet name shows in the sidebar, account menu and page titles.
  revalidatePath('/', 'layout');
  return { ok: true };
}
