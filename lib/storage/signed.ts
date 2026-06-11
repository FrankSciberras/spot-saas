// =============================================================================
// SIGNED STORAGE URLS (server only)
// =============================================================================
// The `documents` and `shift-images` buckets are PRIVATE. Files are stored with
// (historically) a public URL string; this helper recovers the object path from
// that string and mints a short-lived signed URL with the service role. Only
// call it after an RLS-scoped read has already confirmed the caller may see the
// owning record — signing itself bypasses RLS.
// =============================================================================

import { createAdminClient } from '@/lib/supabase/server';

function pathFromStoredUrl(url: string, bucket: string): string | null {
  const markers = [
    `/storage/v1/object/public/${bucket}/`,
    `/storage/v1/object/sign/${bucket}/`,
    `/storage/v1/object/${bucket}/`,
  ];
  for (const m of markers) {
    const idx = url.indexOf(m);
    if (idx !== -1) return url.slice(idx + m.length).split('?')[0] || null;
  }
  // Already a bare storage path (no host).
  return url.startsWith('http') ? null : url;
}

/** Mint a short-lived signed URL for a stored object URL/path. Returns null on failure. */
export async function signStorageUrl(
  storedUrl: string | null | undefined,
  bucket: string,
  expiresIn = 300
): Promise<string | null> {
  if (!storedUrl) return null;
  const path = pathFromStoredUrl(storedUrl, bucket);
  if (!path) return null;

  const admin = createAdminClient();
  const { data } = await admin.storage.from(bucket).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}
