import { NextResponse } from 'next/server';
import { getSession, isAdminOrStaff } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/server';

function getStoragePathFromPublicUrl(url: string): string | null {
  const marker = '/storage/v1/object/public/documents/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;

  const pathWithQuery = url.slice(idx + marker.length);
  const path = pathWithQuery.split('?')[0];
  return path || null;
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdminOrStaff(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await context.params;
  const adminClient = createAdminClient();

  // Tenant check: scope by organization_id. The service-role client bypasses
  // RLS, so without this a fleet admin could delete any other tenant's
  // documents by id.
  const { data: fileRow, error: fetchError } = await adminClient
    .from('files')
    .select('id, file_url')
    .eq('id', id)
    .eq('organization_id', session.organization_id)
    .single();

  if (fetchError || !fileRow) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const storagePath = typeof fileRow.file_url === 'string'
    ? getStoragePathFromPublicUrl(fileRow.file_url)
    : null;

  if (storagePath) {
    const { error: removeError } = await adminClient.storage
      .from('documents')
      .remove([storagePath]);

    if (removeError) {
      return NextResponse.json(
        { error: `Failed to delete file from storage: ${removeError.message}` },
        { status: 500 }
      );
    }
  }

  const { error: deleteError } = await adminClient
    .from('files')
    .delete()
    .eq('id', id);

  if (deleteError) {
    return NextResponse.json(
      { error: `Failed to delete file record: ${deleteError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
