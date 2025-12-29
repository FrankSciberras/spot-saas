-- =============================================================================
-- STORAGE BUCKET SETUP
-- Run this in Supabase SQL Editor to configure storage buckets
-- =============================================================================

-- Create the documents bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents', 
  'documents', 
  true,  -- Make it public so we can get public URLs
  10485760,  -- 10MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];

-- Create the shift-images bucket for vehicle photos during go-online
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'shift-images', 
  'shift-images', 
  true,  -- Make it public so we can get public URLs
  10485760,  -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/heic', 'image/heif'];

-- Drop existing policies if any
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete" ON storage.objects;
DROP POLICY IF EXISTS "Users can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload shift images" ON storage.objects;
DROP POLICY IF EXISTS "Users can view shift images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view shift images" ON storage.objects;

-- =============================================================================
-- DOCUMENTS BUCKET POLICIES
-- =============================================================================

-- Policy: Allow authenticated users to upload files to documents bucket
CREATE POLICY "Users can upload documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');

-- Policy: Allow anyone to view files in documents bucket (since bucket is public)
CREATE POLICY "Users can view documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'documents');

-- Policy: Allow authenticated users to update their uploads
CREATE POLICY "Users can update documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'documents');

-- Policy: Allow authenticated users to delete files
CREATE POLICY "Admins can delete documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'documents');

-- =============================================================================
-- SHIFT-IMAGES BUCKET POLICIES
-- =============================================================================

-- Policy: Allow authenticated users to upload shift images
CREATE POLICY "Users can upload shift images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'shift-images');

-- Policy: Allow authenticated users to view shift images
CREATE POLICY "Users can view shift images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'shift-images');

-- Policy: Allow public/anonymous access to view shift images (for public URLs)
CREATE POLICY "Public can view shift images"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'shift-images');

SELECT 'Storage buckets and policies configured successfully!' as message;
