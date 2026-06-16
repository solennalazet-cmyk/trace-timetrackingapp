CREATE POLICY "Employers manage their worker CVs"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'worker-cvs'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'worker-cvs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);