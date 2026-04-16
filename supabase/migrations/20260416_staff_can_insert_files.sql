-- Allow staff and driver+staff users to create and update file records.
-- Damage photo uploads use the shared files table, so without this policy
-- staff uploads reach storage but fail when inserting the metadata row.

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins/Staff can insert files" ON public.files;
CREATE POLICY "Admins/Staff can insert files"
  ON public.files FOR INSERT
  WITH CHECK (public.is_admin_or_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins/Staff can update files" ON public.files;
CREATE POLICY "Admins/Staff can update files"
  ON public.files FOR UPDATE
  USING (public.is_admin_or_staff(auth.uid()))
  WITH CHECK (public.is_admin_or_staff(auth.uid()));
