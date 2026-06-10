-- Restrict raw third-party credential access to strict org_admin only (exclude managers)

DROP POLICY IF EXISTS "Admins can view org api keys" ON public.org_api_keys;
CREATE POLICY "Strict org admins can view org api keys"
ON public.org_api_keys
FOR SELECT
USING (public.is_strict_org_admin(auth.uid(), org_id) OR public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Org admins can manage own api keys" ON public.org_api_keys;
CREATE POLICY "Strict org admins can manage own api keys"
ON public.org_api_keys
FOR ALL
USING (public.is_strict_org_admin(auth.uid(), org_id))
WITH CHECK (public.is_strict_org_admin(auth.uid(), org_id));

DROP POLICY IF EXISTS "Org admins can manage org whatchimp keys" ON public.whatchimp_api_keys;
CREATE POLICY "Strict org admins can manage org whatchimp keys"
ON public.whatchimp_api_keys
FOR ALL
USING (public.is_strict_org_admin(auth.uid(), org_id))
WITH CHECK (public.is_strict_org_admin(auth.uid(), org_id));