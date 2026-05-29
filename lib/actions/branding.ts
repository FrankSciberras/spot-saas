'use server';

// =============================================================================
// FLEET BRANDING ACTIONS (white-label logo + accent colour)
// =============================================================================
// Only a fleet ADMIN can change their own fleet's branding. Each action
// re-checks the admin role server-side via requireRole(['admin']) — which also
// resolves the caller's active organization_id — then writes with the
// service-role client (scoped to that exact org id). Using the service role
// keeps logo uploads simple (no storage RLS) while the role gate guarantees a
// fleet can only ever rebrand itself.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/session';
import { isValidHex } from '@/lib/branding';

const BRANDING_BUCKET = 'branding';
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB
const LOGO_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

type Result = { error?: string; ok?: boolean; logoUrl?: string | null };

/** Set (or clear, with null/'') the fleet's accent colour. */
export async function updateBrandColorAction(color: string | null): Promise<Result> {
  const user = await requireRole(['admin']);

  let value: string | null = null;
  if (color && color.trim()) {
    const hex = color.trim().toLowerCase();
    if (!isValidHex(hex)) {
      return { error: 'Enter a colour as a 6-digit hex value, e.g. #2f6bff.' };
    }
    value = hex;
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('organizations')
    .update({ brand_color: value })
    .eq('id', user.organization_id);

  if (error) {
    console.error('updateBrandColorAction failed:', error);
    return { error: 'Could not save the colour.' };
  }

  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Upload a new logo image and point the fleet at its public URL. */
export async function uploadLogoAction(formData: FormData): Promise<Result> {
  const user = await requireRole(['admin']);

  const file = formData.get('logo');
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose an image to upload.' };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { error: 'Logo must be 2 MB or smaller.' };
  }
  const ext = LOGO_TYPES[file.type];
  if (!ext) {
    return { error: 'Logo must be a PNG, JPG, WebP or SVG image.' };
  }

  const admin = createAdminClient();
  const path = `${user.organization_id}/logo-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from(BRANDING_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (uploadError) {
    console.error('uploadLogoAction upload failed:', uploadError);
    return { error: 'Could not upload the logo. Please try again.' };
  }

  const {
    data: { publicUrl },
  } = admin.storage.from(BRANDING_BUCKET).getPublicUrl(path);

  const { error: dbError } = await admin
    .from('organizations')
    .update({ logo_url: publicUrl })
    .eq('id', user.organization_id);

  if (dbError) {
    console.error('uploadLogoAction db failed:', dbError);
    return { error: 'Logo uploaded but could not be saved. Please try again.' };
  }

  revalidatePath('/', 'layout');
  return { ok: true, logoUrl: publicUrl };
}

/** Remove the custom logo and fall back to the default Spot logo. */
export async function removeLogoAction(): Promise<Result> {
  const user = await requireRole(['admin']);

  const admin = createAdminClient();
  const { error } = await admin
    .from('organizations')
    .update({ logo_url: null })
    .eq('id', user.organization_id);

  if (error) {
    console.error('removeLogoAction failed:', error);
    return { error: 'Could not remove the logo.' };
  }

  revalidatePath('/', 'layout');
  return { ok: true, logoUrl: null };
}
