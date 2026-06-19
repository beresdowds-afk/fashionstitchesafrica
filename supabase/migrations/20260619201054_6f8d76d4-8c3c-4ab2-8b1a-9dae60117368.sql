
CREATE POLICY "ins_evidence_owner_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'insurance-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "ins_evidence_owner_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'insurance-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "ins_evidence_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'insurance-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "ins_evidence_admin_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'insurance-evidence' AND (
    public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'super_assistant')
  ));
