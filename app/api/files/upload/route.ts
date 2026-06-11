import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/files/upload
 * Upload a file for a driver or vehicle
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
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

    // Tenant check: the owner (driver/vehicle) must be visible to the caller
    // under RLS — i.e. belong to a fleet they're a member of. Without this a
    // user could attach forged documents to another tenant's driver/vehicle.
    const ownerTable = ownerType === 'driver' ? 'drivers' : 'vehicles';
    const { data: owner } = await supabase
      .from(ownerTable)
      .select('id')
      .eq('id', ownerId)
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
      // Try to delete uploaded file
      await supabase.storage.from('documents').remove([uploadData.path]);
      return NextResponse.json({ error: 'Failed to save file record' }, { status: 500 });
    }

    return NextResponse.json({ data: fileRecord }, { status: 201 });
  } catch (error) {
    console.error('File upload error:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
