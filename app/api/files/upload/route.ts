import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';

/**
 * POST /api/files/upload
 * Upload a file for a driver or vehicle
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const ownerType = formData.get('owner_type') as string;
    const ownerId = formData.get('owner_id') as string;
    const docType = formData.get('type') as string;

    if (!file || !ownerType || !ownerId || !docType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (ownerType !== 'driver' && ownerType !== 'vehicle') {
      return NextResponse.json({ error: 'Invalid owner type' }, { status: 400 });
    }

    // Tenant check: the owner (driver/vehicle) must belong to the caller's
    // ACTIVE fleet. RLS alone only proves "some fleet they're a member of", so
    // without the explicit filter a multi-fleet user could attach documents to
    // another of their fleets' driver/vehicle from this one.
    const ownerTable = ownerType === 'driver' ? 'drivers' : 'vehicles';
    const { data: owner } = await supabase
      .from(ownerTable)
      .select('id, organization_id')
      .eq('id', ownerId)
      // active-fleet scope (RLS alone merges a multi-fleet user's orgs)
      .eq('organization_id', session.organization_id)
      .maybeSingle();

    if (!owner) {
      return NextResponse.json({ error: 'Owner not found' }, { status: 404 });
    }

    // Validate file type. The stored extension is derived from the MIME type,
    // not the client-supplied filename, so a mislabelled payload can't smuggle
    // an arbitrary extension into the storage path.
    const extByType: Record<string, string> = {
      'application/pdf': 'pdf',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
    };
    const ext = extByType[file.type];
    if (!ext) {
      return NextResponse.json({ error: 'Invalid file type. Allowed: PDF, JPG, PNG' }, { status: 400 });
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File too large. Max 10MB' }, { status: 400 });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const fileName = `${ownerType}/${ownerId}/${docType}_${timestamp}.${ext}`;

    // Convert File to ArrayBuffer for upload
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(fileName, buffer, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      // Return more specific error message
      return NextResponse.json({ 
        error: `Upload failed: ${uploadError.message}`,
        details: uploadError 
      }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(uploadData.path);

    // Save file record to database
    const { data: fileRecord, error: dbError } = await supabase
      .from('files')
      .insert({
        organization_id: owner.organization_id,
        owner_type: ownerType,
        owner_id: ownerId,
        type: docType,
        file_url: urlData.publicUrl,
        file_name: file.name,
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      // Roll back the orphaned object. Uses the service role: authenticated
      // users deliberately have NO update/delete policy on the bucket
      // (20260902_drop_legacy_storage_write_policies.sql).
      await createAdminClient().storage.from('documents').remove([uploadData.path]);
      return NextResponse.json({ error: 'Failed to save file record' }, { status: 500 });
    }

    return NextResponse.json({ data: fileRecord }, { status: 201 });
  } catch (error) {
    console.error('File upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
