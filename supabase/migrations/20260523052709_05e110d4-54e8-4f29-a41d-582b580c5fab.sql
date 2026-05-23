
-- 1) org_websites: drop public SELECT policy (api_key/api_secret leakage)
DROP POLICY IF EXISTS "Anyone can view enabled org websites public" ON public.org_websites;

-- 2) Storage: replace permissive org-assets update/delete policies with ownership-scoped ones
DROP POLICY IF EXISTS "Org admins can update assets"  ON storage.objects;
DROP POLICY IF EXISTS "Org admins can delete assets"  ON storage.objects;
DROP POLICY IF EXISTS "Org members can update assets" ON storage.objects;
DROP POLICY IF EXISTS "Org members can delete assets" ON storage.objects;
DROP POLICY IF EXISTS "Org members can upload assets" ON storage.objects;

CREATE POLICY "Org admins update own org assets"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'org-assets'
  AND auth.uid() IS NOT NULL
  AND (
    public.is_org_admin(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
    OR public.has_role(auth.uid(), 'super_admin')
  )
);

CREATE POLICY "Org admins delete own org assets"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'org-assets'
  AND auth.uid() IS NOT NULL
  AND (
    public.is_org_admin(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
    OR public.has_role(auth.uid(), 'super_admin')
  )
);

-- 3) tryon-images: scope upload to user's own folder
DROP POLICY IF EXISTS "Authenticated users can upload tryon images" ON storage.objects;
CREATE POLICY "Users upload own tryon images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'tryon-images'
  AND auth.uid() IS NOT NULL
  AND (string_to_array(name, '/'))[1] = auth.uid()::text
);
CREATE POLICY "Users update own tryon images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'tryon-images'
  AND auth.uid() IS NOT NULL
  AND (string_to_array(name, '/'))[1] = auth.uid()::text
);
CREATE POLICY "Users delete own tryon images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'tryon-images'
  AND auth.uid() IS NOT NULL
  AND (string_to_array(name, '/'))[1] = auth.uid()::text
);

-- 4) comms_token_usage: restrict client inserts to self
DROP POLICY IF EXISTS "System inserts usage" ON public.comms_token_usage;
CREATE POLICY "Users insert own usage"
ON public.comms_token_usage FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND user_id = auth.uid()
);

-- 5) Lock down SECURITY DEFINER helper functions from anon role
REVOKE EXECUTE ON FUNCTION public.create_organization_with_admin(text, text, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_role(public.app_role)                          FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.join_organization(uuid, public.app_role)              FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_designer_personal_org()                        FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_promotional_grant(text, uuid)                   FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_promotional_grant(uuid, text)                     FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.org_has_promotional_grant(uuid, text)                 FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb)                            FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer)              FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint)                            FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb)                FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_sentinel_storage_objects(integer)     FROM anon, PUBLIC;

-- 6) realtime.messages: require authenticated subscribers
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'messages' AND relnamespace = 'realtime'::regnamespace) THEN
    EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can subscribe to realtime" ON realtime.messages';
    EXECUTE 'CREATE POLICY "Authenticated users can subscribe to realtime"
             ON realtime.messages FOR SELECT
             USING (auth.uid() IS NOT NULL)';
  END IF;
END $$;
