'use server';

// =============================================================================
// PLATFORM-ADMIN — WEBSITE POP-UPS
// =============================================================================
// Create, edit, switch on/off, duplicate and delete the pop-ups shown on the
// public website (lib/popups). Platform admin only; writes with the service
// role. The website picks changes up within a few seconds (lib/popups/server).
// =============================================================================

import { createAdminClient } from '@/lib/supabase/server';
import { requirePlatformAdmin } from '@/lib/auth/platform';
import { isValidDay } from '@/lib/billing/trial-offer';
import { invalidateLivePopups, listPopupsWithStats } from '@/lib/popups/server';
import { UUID_RE, popupFromRow, popupInputToRow, type PopupInput, type PopupStats, type SitePopup } from '@/lib/popups/types';

type Row = SitePopup & { stats: PopupStats; recent: PopupStats };
type Result = { error?: string; ok?: boolean; popup?: SitePopup };

const IMAGE_BUCKET = 'branding';
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

export async function listSitePopupsAction(): Promise<{ popups: Row[]; error?: string }> {
  await requirePlatformAdmin();
  return listPopupsWithStats();
}

/** Create (no id) or update (with id) a pop-up. */
export async function saveSitePopupAction(input: PopupInput): Promise<Result> {
  await requirePlatformAdmin();
  const cleaned = popupInputToRow(input, isValidDay);
  if ('error' in cleaned) return { error: cleaned.error };

  const admin = createAdminClient();
  const row = { ...cleaned.row, updated_at: new Date().toISOString() };
  const query = input.id
    ? UUID_RE.test(input.id)
      ? admin.from('site_popups').update(row).eq('id', input.id).select('*').maybeSingle()
      : null
    : admin.from('site_popups').insert(row).select('*').single();
  if (!query) return { error: 'That pop-up no longer exists.' };

  const { data, error } = await query;
  if (error || !data) {
    console.error('saveSitePopupAction failed:', error);
    return { error: input.id ? 'Couldn’t save the pop-up.' : 'Couldn’t create the pop-up.' };
  }
  invalidateLivePopups();
  return { ok: true, popup: popupFromRow(data) };
}

export async function setSitePopupEnabledAction(id: string, enabled: boolean): Promise<Result> {
  await requirePlatformAdmin();
  if (!UUID_RE.test(id)) return { error: 'That pop-up no longer exists.' };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('site_popups')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error || !data) return { error: enabled ? 'Couldn’t switch it on.' : 'Couldn’t switch it off.' };
  invalidateLivePopups();
  return { ok: true, popup: popupFromRow(data) };
}

/** "Show again to everyone": visitors who already saw or closed it see it again. */
export async function resetSitePopupSeenAction(id: string): Promise<Result> {
  await requirePlatformAdmin();
  if (!UUID_RE.test(id)) return { error: 'That pop-up no longer exists.' };
  const admin = createAdminClient();
  const { data: cur } = await admin.from('site_popups').select('version').eq('id', id).maybeSingle();
  if (!cur) return { error: 'That pop-up no longer exists.' };
  const { data, error } = await admin
    .from('site_popups')
    .update({ version: (cur.version ?? 1) + 1, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error || !data) return { error: 'Couldn’t reset it.' };
  invalidateLivePopups();
  return { ok: true, popup: popupFromRow(data) };
}

export async function duplicateSitePopupAction(id: string): Promise<Result> {
  await requirePlatformAdmin();
  if (!UUID_RE.test(id)) return { error: 'That pop-up no longer exists.' };
  const admin = createAdminClient();
  const { data: src } = await admin.from('site_popups').select('*').eq('id', id).maybeSingle();
  if (!src) return { error: 'That pop-up no longer exists.' };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, created_at: _c, updated_at: _u, version: _v, ...rest } = src;
  const { data, error } = await admin
    .from('site_popups')
    .insert({ ...rest, name: `${String(src.name).slice(0, 72)} (copy)`, enabled: false })
    .select('*')
    .single();
  if (error || !data) return { error: 'Couldn’t duplicate it.' };
  return { ok: true, popup: popupFromRow(data) };
}

export async function deleteSitePopupAction(id: string): Promise<Result> {
  await requirePlatformAdmin();
  if (!UUID_RE.test(id)) return { error: 'That pop-up no longer exists.' };
  const admin = createAdminClient();
  const { error } = await admin.from('site_popups').delete().eq('id', id);
  if (error) return { error: 'Couldn’t delete it.' };
  invalidateLivePopups();
  return { ok: true };
}

/** Upload an image for a pop-up; returns its public URL to put in the form. */
export async function uploadSitePopupImageAction(formData: FormData): Promise<{ error?: string; url?: string }> {
  await requirePlatformAdmin();
  const file = formData.get('image');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose an image to upload.' };
  if (file.size > MAX_IMAGE_BYTES) return { error: 'The image must be 3 MB or smaller.' };
  const ext = IMAGE_TYPES[file.type];
  if (!ext) return { error: 'Use a PNG, JPG, WebP, GIF or SVG image.' };

  const admin = createAdminClient();
  const path = `site-popups/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { error } = await admin.storage
    .from(IMAGE_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, cacheControl: '31536000' });
  if (error) {
    console.error('uploadSitePopupImageAction failed:', error);
    return { error: 'Couldn’t upload the image. Please try again.' };
  }
  const {
    data: { publicUrl },
  } = admin.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  return { url: publicUrl };
}
