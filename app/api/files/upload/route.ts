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

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Allowed: PDF, JPG, PNG' }, { status: 400 });
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File too large. Max 10MB' }, { status: 400 });
    }

    // Generate unique filename
    const ext = file.name.split('.').pop();
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
