'use server';

// =============================================================================
// VEHICLE MODEL PRESET ACTIONS (platform-admin only)
// =============================================================================
// A global library of car-model diagram presets. Only the PLATFORM admin (the
// SaaS operator) may create/edit them — every action re-checks via
// requirePlatformAdmin() and writes with the service-role client. Fleet
// operators only pick a preset for a vehicle (vehicles.vehicle_model_id); the
// damage zones traced over each preset's image live in vehicle_diagram_zones.
//
// Mirrors lib/actions/branding.ts (service-role writes to a public bucket, no
// storage RLS needed; the platform-admin gate guarantees who can write).
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { requirePlatformAdmin } from '@/lib/auth/platform';
import type { VehicleModel } from '@/lib/types/database';

const MODELS_BUCKET = 'vehicle-models';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

type Result = {
  error?: string;
  ok?: boolean;
  model?: VehicleModel;
  imageUrl?: string;
};

/** lowercase, hyphen-separated slug, e.g. "Toyota Yaris Cross" -> "toyota-yaris-cross". */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Create a new preset. model_key is a unique slug of the name. */
export async function createVehicleModelAction(
  name: string,
  make?: string,
  model?: string
): Promise<Result> {
  await requirePlatformAdmin();

  const trimmedName = name.trim();
  if (!trimmedName) {
    return { error: 'Give the model a name.' };
  }

  const base = slugify(trimmedName);
  if (!base) {
    return { error: 'Name must contain letters or numbers.' };
  }

  const admin = createAdminClient();

  // Ensure a unique model_key (append -2, -3, ... on collision).
  let modelKey = base;
  for (let i = 2; ; i++) {
    const { data: existing } = await admin
      .from('vehicle_models')
      .select('id')
      .eq('model_key', modelKey)
      .maybeSingle();
    if (!existing) break;
    modelKey = `${base}-${i}`;
  }

  const { data, error } = await admin
    .from('vehicle_models')
    .insert({
      name: trimmedName,
      make: make?.trim() || null,
      model: model?.trim() || null,
      model_key: modelKey,
    })
    .select()
    .single();

  if (error) {
    console.error('createVehicleModelAction failed:', error);
    return { error: 'Could not create the model.' };
  }

  revalidatePath('/admin');
  return { ok: true, model: data as VehicleModel };
}

/**
 * Upload a top or side image for a preset.
 * formData: modelId (string), view ('side'|'top'), image (File)
 */
export async function uploadModelImageAction(formData: FormData): Promise<Result> {
  await requirePlatformAdmin();

  const modelId = String(formData.get('modelId') || '');
  const view = String(formData.get('view') || '');
  const file = formData.get('image');

  if (!modelId) return { error: 'Missing model.' };
  if (view !== 'side' && view !== 'top') return { error: 'Invalid view.' };
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose an image to upload.' };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: 'Image must be 5 MB or smaller.' };
  }
  const ext = IMAGE_TYPES[file.type];
  if (!ext) {
    return { error: 'Image must be a PNG, JPG, WebP or SVG.' };
  }

  const admin = createAdminClient();
  const path = `${modelId}/${view}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from(MODELS_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (uploadError) {
    console.error('uploadModelImageAction upload failed:', uploadError);
    return { error: 'Could not upload the image. Please try again.' };
  }

  const {
    data: { publicUrl },
  } = admin.storage.from(MODELS_BUCKET).getPublicUrl(path);

  const column = view === 'side' ? 'side_image_url' : 'top_image_url';
  const { error: dbError } = await admin
    .from('vehicle_models')
    .update({ [column]: publicUrl, updated_at: new Date().toISOString() })
    .eq('id', modelId);

  if (dbError) {
    console.error('uploadModelImageAction db failed:', dbError);
    return { error: 'Image uploaded but could not be saved. Please try again.' };
  }

  revalidatePath('/admin');
  return { ok: true, imageUrl: publicUrl };
}

/** Publish / unpublish a preset (unpublished = hidden from fleet operators). */
export async function setVehicleModelPublishedAction(
  id: string,
  published: boolean
): Promise<Result> {
  await requirePlatformAdmin();

  const admin = createAdminClient();
  const { error } = await admin
    .from('vehicle_models')
    .update({ is_published: published, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('setVehicleModelPublishedAction failed:', error);
    return { error: 'Could not update the model.' };
  }

  revalidatePath('/admin');
  return { ok: true };
}

/** Delete a preset and its traced zones. Vehicles referencing it are detached. */
export async function deleteVehicleModelAction(id: string): Promise<Result> {
  await requirePlatformAdmin();

  const admin = createAdminClient();

  // Look up model_key so we can clean up its zone rows too.
  const { data: model } = await admin
    .from('vehicle_models')
    .select('model_key')
    .eq('id', id)
    .maybeSingle();

  if (model?.model_key) {
    await admin.from('vehicle_diagram_zones').delete().eq('model_key', model.model_key);
  }

  const { error } = await admin.from('vehicle_models').delete().eq('id', id);

  if (error) {
    console.error('deleteVehicleModelAction failed:', error);
    return { error: 'Could not delete the model.' };
  }

  revalidatePath('/admin');
  return { ok: true };
}
