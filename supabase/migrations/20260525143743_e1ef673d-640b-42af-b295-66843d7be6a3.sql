-- Remove broad org-assets write policies that allow cross-tenant writes
DROP POLICY IF EXISTS "Org members can upload assets" ON storage.objects;
DROP POLICY IF EXISTS "Org members can update assets" ON storage.objects;
DROP POLICY IF EXISTS "Org members can delete assets" ON storage.objects;
DROP POLICY IF EXISTS "Org admins can update assets" ON storage.objects;
DROP POLICY IF EXISTS "Org admins can delete assets" ON storage.objects;

-- Ensure only org admins/managers or super admins can write inside their own org folder
DROP POLICY IF EXISTS "Authenticated org members can upload assets" ON storage.objects;
CREATE POLICY "Authenticated org admins upload own org assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'org-assets'
  AND auth.uid() IS NOT NULL
  AND (
    public.is_org_admin(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Org admins update own org assets" ON storage.objects;
CREATE POLICY "Org admins update own org assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'org-assets'
  AND auth.uid() IS NOT NULL
  AND (
    public.is_org_admin(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'org-assets'
  AND auth.uid() IS NOT NULL
  AND (
    public.is_org_admin(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Org admins delete own org assets" ON storage.objects;
CREATE POLICY "Org admins delete own org assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'org-assets'
  AND auth.uid() IS NOT NULL
  AND (
    public.is_org_admin(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

-- Remove unscoped try-on upload and keep user-folder scoped writes only
DROP POLICY IF EXISTS "Authenticated users can upload tryon images" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own tryon images" ON storage.objects;
CREATE POLICY "Users upload own tryon images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'tryon-images'
  AND auth.uid() IS NOT NULL
  AND (string_to_array(name, '/'))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users update own tryon images" ON storage.objects;
CREATE POLICY "Users update own tryon images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'tryon-images'
  AND auth.uid() IS NOT NULL
  AND (string_to_array(name, '/'))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'tryon-images'
  AND auth.uid() IS NOT NULL
  AND (string_to_array(name, '/'))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users delete own tryon images" ON storage.objects;
CREATE POLICY "Users delete own tryon images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'tryon-images'
  AND auth.uid() IS NOT NULL
  AND (string_to_array(name, '/'))[1] = auth.uid()::text
);

-- Restrict officer records containing email/phone to staff/admin roles only.
DROP POLICY IF EXISTS "Anyone can view public officers" ON public.org_company_officers;
DROP POLICY IF EXISTS "Authenticated users can view public officers" ON public.org_company_officers;
DROP POLICY IF EXISTS "Org members and admins read officers" ON public.org_company_officers;
CREATE POLICY "Org admins and managers read officers"
ON public.org_company_officers
FOR SELECT
TO authenticated
USING (
  public.is_org_admin(auth.uid(), org_id)
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.has_role(auth.uid(), 'super_assistant'::public.app_role)
);

-- Public officer presentation remains available only through this safe helper.
CREATE OR REPLACE FUNCTION public.get_public_org_officers(_org_id uuid)
RETURNS TABLE(id uuid, org_id uuid, full_name text, title text, bio text, photo_url text, display_order integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id, org_id, full_name, title, bio, photo_url, display_order
  FROM public.org_company_officers
  WHERE org_id = _org_id AND is_public = true
  ORDER BY display_order;
$$;

-- Stop anonymous users from listing all enabled embed configurations.
DROP POLICY IF EXISTS "Public can read enabled configs by widget_key" ON public.embed_configurations;

-- Realtime channel authorization: remove older broad policies and install scoped access.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can subscribe to realtime" ON realtime.messages;
DROP POLICY IF EXISTS "Restrict realtime subscriptions to allowed topics" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated realtime channel access" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated realtime channel write" ON realtime.messages;

CREATE POLICY "Authenticated realtime channel access"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND CASE
    WHEN realtime.topic() LIKE 'org-sync-%' THEN
      public.is_org_member(auth.uid(), NULLIF(substring(realtime.topic() FROM 'org-sync-(.+)'), '')::uuid)
    WHEN realtime.topic() LIKE 'ai-jobs-%' THEN
      public.is_org_member(auth.uid(), NULLIF(substring(realtime.topic() FROM 'ai-jobs-(.+)'), '')::uuid)
    WHEN realtime.topic() LIKE 'org_company_officers:%' THEN
      public.is_org_admin(auth.uid(), NULLIF(substring(realtime.topic() FROM 'org_company_officers:(.+)'), '')::uuid)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_assistant'::public.app_role)
    WHEN realtime.topic() LIKE 'user:%' THEN
      NULLIF(substring(realtime.topic() FROM 'user:(.+)'), '') = auth.uid()::text
    WHEN realtime.topic() IN ('admin-dva-transactions','webhook_event_log_stream','sentinel_agent_incidents_feed','platform-updates-worker') THEN
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_assistant'::public.app_role)
    WHEN realtime.topic() IN ('platform-tour-tracks-sync','tour-sync-state') THEN true
    WHEN realtime.topic() LIKE 'room:%' OR realtime.topic() LIKE 'chat-%' THEN true
    ELSE false
  END
);

CREATE POLICY "Authenticated realtime channel write"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND CASE
    WHEN realtime.topic() LIKE 'org-sync-%' THEN
      public.is_org_member(auth.uid(), NULLIF(substring(realtime.topic() FROM 'org-sync-(.+)'), '')::uuid)
    WHEN realtime.topic() LIKE 'ai-jobs-%' THEN
      public.is_org_member(auth.uid(), NULLIF(substring(realtime.topic() FROM 'ai-jobs-(.+)'), '')::uuid)
    WHEN realtime.topic() LIKE 'org_company_officers:%' THEN
      public.is_org_admin(auth.uid(), NULLIF(substring(realtime.topic() FROM 'org_company_officers:(.+)'), '')::uuid)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_assistant'::public.app_role)
    WHEN realtime.topic() LIKE 'user:%' THEN
      NULLIF(substring(realtime.topic() FROM 'user:(.+)'), '') = auth.uid()::text
    WHEN realtime.topic() IN ('admin-dva-transactions','webhook_event_log_stream','sentinel_agent_incidents_feed','platform-updates-worker') THEN
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_assistant'::public.app_role)
    WHEN realtime.topic() IN ('platform-tour-tracks-sync','tour-sync-state') THEN true
    WHEN realtime.topic() LIKE 'room:%' OR realtime.topic() LIKE 'chat-%' THEN true
    ELSE false
  END
);

-- Keep direct calls to the safe public officer helper available for public org pages.
GRANT EXECUTE ON FUNCTION public.get_public_org_officers(uuid) TO anon, authenticated;