-- =============================================================================
-- SECURITY: drop the two legacy WRITE policies on the `documents` bucket
-- =============================================================================
-- The original pre-SaaS storage setup (supabase/setup_storage.sql) created:
--   "Users can update documents"   FOR UPDATE TO authenticated USING (bucket_id = 'documents')
--   "Admins can delete documents"  FOR DELETE TO authenticated USING (bucket_id = 'documents')
-- Despite the names, both apply to EVERY signed-in user of EVERY fleet: anyone
-- who learned an object path (drivers can see their fleet's vehicle-document
-- URLs) could overwrite or delete any licence/ID scan in the bucket.
--
-- 20260610_private_storage_buckets.sql intended to remove them but dropped a
-- policy name that never existed ("Admins can manage documents"), so both are
-- most likely still live. This migration drops the real names.
--
-- Every storage UPDATE/DELETE in the app now runs under the service role
-- (app/api/files/[id] DELETE, the upload-rollback in app/api/files/upload,
-- branding + vehicle-model uploads), which bypasses RLS — so authenticated
-- users only need the INSERT policies that 20260610 kept.
-- =============================================================================

DROP POLICY IF EXISTS "Users can update documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete documents" ON storage.objects;

-- Belt and braces: both buckets must stay private (20260610 did this; re-assert).
UPDATE storage.buckets SET public = false WHERE id IN ('documents', 'shift-images');

SELECT 'Legacy documents UPDATE/DELETE storage policies dropped' AS message;
