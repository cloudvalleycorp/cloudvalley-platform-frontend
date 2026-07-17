
-- Allow org viewers to read storage objects for documents that are public
-- and that belong to startups linked to their organization.
CREATE POLICY "Org viewers read public startup files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND is_startup_in_user_orgs(auth.uid(), ((storage.foldername(name))[1])::uuid)
  AND NOT EXISTS (
    SELECT 1 FROM public.document_privacy dp
    WHERE dp.startup_id = ((storage.foldername(name))[1])::uuid
      AND dp.is_public = false
      AND position(dp.document_id::text in name) > 0
  )
);
