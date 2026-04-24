-- Caps configuration table
CREATE TABLE public.promotional_grant_caps (
  grant_type TEXT PRIMARY KEY,
  cap INTEGER NOT NULL CHECK (cap >= 0),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed promotional caps
INSERT INTO public.promotional_grant_caps (grant_type, cap, description) VALUES
  ('tailor', 100, 'First 100 tailors get free registration / waived signup fees'),
  ('designer', 30, 'First 30 designers get free designer subscription'),
  ('organization', 5, 'First 5 organizations get free registration / waived signup fees')
ON CONFLICT (grant_type) DO NOTHING;

ALTER TABLE public.promotional_grant_caps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view caps"
  ON public.promotional_grant_caps FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admins manage caps"
  ON public.promotional_grant_caps FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Grants table
CREATE TABLE public.promotional_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_type TEXT NOT NULL REFERENCES public.promotional_grant_caps(grant_type),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  slot_number INTEGER NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  CHECK (
    (grant_type = 'organization' AND org_id IS NOT NULL)
    OR (grant_type IN ('tailor','designer') AND user_id IS NOT NULL)
  ),
  UNIQUE (grant_type, slot_number)
);

CREATE UNIQUE INDEX promotional_grants_user_unique
  ON public.promotional_grants (grant_type, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX promotional_grants_org_unique
  ON public.promotional_grants (grant_type, org_id)
  WHERE org_id IS NOT NULL;

ALTER TABLE public.promotional_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own grants"
  ON public.promotional_grants FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'super_admin')
    OR (org_id IS NOT NULL AND public.is_org_admin(auth.uid(), org_id))
  );

-- No INSERT/UPDATE/DELETE policies for normal users — only the SECURITY DEFINER
-- functions below may write rows.

-- Atomic claim function (idempotent)
CREATE OR REPLACE FUNCTION public.claim_promotional_grant(
  _grant_type TEXT,
  _org_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _cap INTEGER;
  _is_active BOOLEAN;
  _used INTEGER;
  _slot INTEGER;
  _existing public.promotional_grants%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _grant_type NOT IN ('tailor','designer','organization') THEN
    RAISE EXCEPTION 'Invalid grant_type %', _grant_type;
  END IF;

  -- Lock the cap row to serialize concurrent claims
  SELECT cap, is_active INTO _cap, _is_active
    FROM public.promotional_grant_caps
   WHERE grant_type = _grant_type
   FOR UPDATE;

  IF _cap IS NULL THEN
    RAISE EXCEPTION 'Unknown grant type %', _grant_type;
  END IF;

  -- Idempotency: return existing grant if any
  IF _grant_type = 'organization' THEN
    IF _org_id IS NULL THEN
      RAISE EXCEPTION 'org_id required for organization grant';
    END IF;
    -- Caller must be admin of the org
    IF NOT public.is_org_admin(_uid, _org_id) THEN
      RAISE EXCEPTION 'Only an org admin can claim an organization grant';
    END IF;
    SELECT * INTO _existing FROM public.promotional_grants
     WHERE grant_type = _grant_type AND org_id = _org_id;
  ELSE
    SELECT * INTO _existing FROM public.promotional_grants
     WHERE grant_type = _grant_type AND user_id = _uid;
  END IF;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'granted', true,
      'already_claimed', true,
      'slot_number', _existing.slot_number,
      'cap', _cap
    );
  END IF;

  IF NOT _is_active THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'inactive', 'cap', _cap);
  END IF;

  SELECT COUNT(*) INTO _used FROM public.promotional_grants
   WHERE grant_type = _grant_type;

  IF _used >= _cap THEN
    RETURN jsonb_build_object('granted', false, 'reason', 'cap_reached', 'cap', _cap, 'used', _used);
  END IF;

  _slot := _used + 1;

  IF _grant_type = 'organization' THEN
    INSERT INTO public.promotional_grants (grant_type, org_id, slot_number)
    VALUES (_grant_type, _org_id, _slot);

    -- Also add a fee exemption for the organization
    INSERT INTO public.org_fee_exemptions (org_id, exemption_type, reason, granted_by)
    VALUES (_org_id, 'registration', 'Promotional: first 5 organizations free', 'promotional_grant')
    ON CONFLICT (org_id, exemption_type) DO NOTHING;
  ELSE
    INSERT INTO public.promotional_grants (grant_type, user_id, slot_number)
    VALUES (_grant_type, _uid, _slot);
  END IF;

  RETURN jsonb_build_object(
    'granted', true,
    'already_claimed', false,
    'slot_number', _slot,
    'cap', _cap
  );
END;
$$;

-- Lightweight check (callable by edge functions with service role context too)
CREATE OR REPLACE FUNCTION public.has_promotional_grant(
  _user_id UUID,
  _grant_type TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.promotional_grants
    WHERE grant_type = _grant_type AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.org_has_promotional_grant(
  _org_id UUID,
  _grant_type TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.promotional_grants
    WHERE grant_type = _grant_type AND org_id = _org_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.claim_promotional_grant(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_promotional_grant(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.org_has_promotional_grant(UUID, TEXT) TO authenticated, service_role;