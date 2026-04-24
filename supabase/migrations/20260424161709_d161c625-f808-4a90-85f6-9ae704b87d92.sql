-- ── customer_registrations: FK + unique gateway_reference ──────────────
ALTER TABLE public.customer_registrations
  ADD CONSTRAINT customer_registrations_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS customer_registrations_gateway_reference_uniq
  ON public.customer_registrations (gateway_reference)
  WHERE gateway_reference IS NOT NULL;

-- ── customer_subscriptions: FK + unique(user_id, plan_name) ────────────
ALTER TABLE public.customer_subscriptions
  ADD CONSTRAINT customer_subscriptions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS customer_subscriptions_user_plan_uniq
  ON public.customer_subscriptions (user_id, plan_name);

-- ── Faster portal membership lookups ───────────────────────────────────
CREATE INDEX IF NOT EXISTS org_members_user_role_active_idx
  ON public.org_members (user_id, role, is_active);

-- ── RPC: assign_role (self-service, safe) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_role(_role public.app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _role IN ('super_admin', 'super_assistant') THEN
    RAISE EXCEPTION 'Cannot self-assign privileged role %', _role;
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, _role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_role(public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_role(public.app_role) TO authenticated;

-- ── RPC: join_organization (canonical helper) ──────────────────────────
CREATE OR REPLACE FUNCTION public.join_organization(
  _org_id uuid,
  _role public.app_role DEFAULT 'customer'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing public.org_members%ROWTYPE;
  _org_active boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _role IN ('super_admin', 'super_assistant', 'org_admin') THEN
    RAISE EXCEPTION 'Cannot self-grant role %', _role;
  END IF;

  SELECT is_active INTO _org_active FROM public.organizations WHERE id = _org_id;
  IF _org_active IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;
  IF _org_active = false THEN
    RAISE EXCEPTION 'Organization is not active';
  END IF;

  SELECT * INTO _existing FROM public.org_members
  WHERE org_id = _org_id AND user_id = _uid;

  IF FOUND THEN
    -- Reactivate / update role if needed
    UPDATE public.org_members
       SET is_active = true,
           role = _role
     WHERE id = _existing.id;
    RETURN jsonb_build_object(
      'membership_id', _existing.id,
      'created', false,
      'reactivated', NOT _existing.is_active
    );
  END IF;

  INSERT INTO public.org_members (org_id, user_id, role, is_active)
  VALUES (_org_id, _uid, _role, true)
  RETURNING id INTO _existing.id;

  RETURN jsonb_build_object(
    'membership_id', _existing.id,
    'created', true,
    'reactivated', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.join_organization(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_organization(uuid, public.app_role) TO authenticated;

-- ── RPC: ensure_designer_personal_org ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_designer_personal_org()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing_org uuid;
  _new_org uuid;
  _display text;
  _base_slug text;
  _slug text;
  _suffix int := 0;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- If designer already has any active org_members row with role=designer, reuse it
  SELECT org_id INTO _existing_org
    FROM public.org_members
   WHERE user_id = _uid AND role = 'designer' AND is_active = true
   ORDER BY joined_at ASC
   LIMIT 1;

  IF _existing_org IS NOT NULL THEN
    RETURN _existing_org;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(display_name), ''), 'Designer Studio')
    INTO _display
    FROM public.profiles WHERE id = _uid;

  _base_slug := regexp_replace(lower(COALESCE(_display, 'designer')), '[^a-z0-9]+', '-', 'g');
  _base_slug := trim(both '-' from _base_slug);
  IF _base_slug = '' THEN _base_slug := 'designer'; END IF;
  _slug := _base_slug;

  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = _slug) LOOP
    _suffix := _suffix + 1;
    _slug := _base_slug || '-' || _suffix::text;
  END LOOP;

  INSERT INTO public.organizations (name, slug, description, country, currency, is_active)
  VALUES (_display, _slug, 'Personal designer studio', 'NG', 'NGN', true)
  RETURNING id INTO _new_org;

  -- Designer is both admin of their own studio AND has the designer role
  INSERT INTO public.org_members (org_id, user_id, role, is_active)
  VALUES (_new_org, _uid, 'org_admin', true)
  ON CONFLICT (org_id, user_id) DO NOTHING;

  INSERT INTO public.org_members (org_id, user_id, role, is_active)
  VALUES (_new_org, _uid, 'designer', true)
  ON CONFLICT (org_id, user_id) DO UPDATE SET role = 'designer', is_active = true;

  -- Mirror role into user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'designer')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN _new_org;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_designer_personal_org() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_designer_personal_org() TO authenticated;