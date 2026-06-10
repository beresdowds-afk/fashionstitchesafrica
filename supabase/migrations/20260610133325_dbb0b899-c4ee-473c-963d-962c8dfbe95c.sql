
CREATE OR REPLACE FUNCTION public.is_strict_org_admin(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = _user_id AND org_id = _org_id
      AND role = 'org_admin' AND is_active = true
  )
$$;

DROP POLICY IF EXISTS "Org admins can manage their website" ON public.org_websites;

CREATE POLICY "Strict org admins can manage their website"
ON public.org_websites
FOR ALL
USING (public.is_strict_org_admin(auth.uid(), org_id) OR public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.is_strict_org_admin(auth.uid(), org_id) OR public.has_role(auth.uid(), 'super_admin'));
