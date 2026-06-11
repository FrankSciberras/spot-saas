import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createClient, createAdminClient } from '@/lib/supabase/server';

/**
 * GET /api/files/[id]/view
 *
 * Authenticated proxy for documents in the (now PRIVATE) `documents` bucket.
 * The file row is loaded with the RLS client, so the caller only resolves a
 * file they're allowed to see (org admins/staff → their fleet's files; a driver
 * → their own + their fleet's vehicle docs). We then mint a short-lived signed
 * URL with the service role and redirect to it. This replaces the old world-
 * readable public URLs, which leaked government-ID scans to anyone with a link.
 */
function storagePathFromUrl(url: string): string | null {
  const markers = [
    '/storage/v1/object/public/documents/',
    '/storage/v1/object/sign/documents/',
    '/storage/v1/object/documents/',
  ];
  for (const m of markers) {
    const idx = url.indexOf(m);
    if (idx !== -1) return url.slice(idx + m.length).split('?')[0] || null;
  }
  // Already a bare storage path (no host).
  return url.startsWith('http') ? null : url;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // RLS-scoped read: returns the row only if the caller may access this file.
  const supabase = await createClient();
  const { data: file } = await supabase
    .from('files')
    .select('id, file_url')
    .eq('id', id)
    .maybeSingle();

  if (!file || typeof file.file_url !== 'string') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const path = storagePathFromUrl(file.file_url);
  if (!path) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage
    .from('documents')
    .createSignedUrl(path, 300); // 5-minute link

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
