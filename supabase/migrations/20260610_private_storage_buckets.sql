-- =============================================================================
-- SECURITY: make document/photo storage buckets PRIVATE
-- =============================================================================
-- Previously the `documents` and `shift-images` buckets were public=true with
-- "anyone can view" SELECT policies (incl. an `anon` grant on shift-images).
-- That meant every driver licence, ID card, police-conduct doc and invoice was
-- retrievable by anyone with the (partially guessable) URL — a GDPR-grade leak.
--
-- Both buckets are now PRIVATE. The app serves these files through the
-- authenticated proxy `GET /api/files/[id]/view` (documents) and via short-lived
-- signed URLs minted server-side after an RLS-scoped ownership check. Direct
-- public/anon reads are removed.
-- =============================================================================

UPDATE storage.buckets SET public = false WHERE id IN ('documents', 'shift-images');

-- Remove every legacy "anyone can read" policy.
DROP POLICY IF EXISTS "Users can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view" ON storage.objects;
DROP POLICY IF EXISTS "Users can view shift images" ON storage.objects;
DROP POLICY IF EXISTS "Public can view shift images" ON storage.objects;

-- Uploads still come from the authenticated app client (org_id is auto-stamped
-- on the files row; the object path is validated server-side). Keep INSERT.
DROP POLICY IF EXISTS "Users can upload documents" ON storage.objects;
CREATE POLICY "Users can upload documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');

DROP POLICY IF EXISTS "Users can upload shift images" ON storage.objects;
CREATE POLICY "Users can upload shift images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'shift-images');

-- Reads/deletes go through the service role (signed URLs / proxy / admin
-- delete), which bypasses RLS — so no public SELECT policy is created. Direct
-- unauthenticated access is no longer possible now that the buckets are private.

SELECT 'documents + shift-images buckets are now private' AS message;
