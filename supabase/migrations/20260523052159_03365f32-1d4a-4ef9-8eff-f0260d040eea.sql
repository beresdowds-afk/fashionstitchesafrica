
CREATE OR REPLACE FUNCTION public.create_organization_with_admin(
  _name text, _slug text, _country text DEFAULT 'NG', _currency text DEFAULT 'NGN'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing_id uuid;
  _new_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- If slug already taken, return existing org if caller is already a member, else error.
  SELECT id INTO _existing_id FROM public.organizations WHERE slug = _slug;
  IF _existing_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.org_members WHERE org_id = _existing_id AND user_id = _uid AND is_active = true) THEN
      UPDATE public.profiles SET current_org_id = _existing_id WHERE id = _uid;
      RETURN jsonb_build_object('id', _existing_id, 'reused', true);
    ELSE
      RAISE EXCEPTION 'An organization with that name/slug already exists. Please choose a different name.'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  INSERT INTO public.organizations (name, slug, country, currency, is_active)
  VALUES (_name, _slug, _country, _currency, true)
  RETURNING id INTO _new_id;

  INSERT INTO public.org_members (org_id, user_id, role, is_active)
  VALUES (_new_id, _uid, 'org_admin', true);

  UPDATE public.profiles SET current_org_id = _new_id WHERE id = _uid;

  RETURN jsonb_build_object('id', _new_id, 'reused', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_organization_with_admin(text, text, text, text) TO authenticated;
