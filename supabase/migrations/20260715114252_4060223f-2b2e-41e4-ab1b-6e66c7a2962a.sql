
-- 1. Create profile_identity
CREATE TABLE IF NOT EXISTS public.profile_identity (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  identity_number text,
  identity_type text DEFAULT 'national_id',
  identity_verification_status text DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Backfill from profiles (only where any of the columns are set)
INSERT INTO public.profile_identity (id, identity_number, identity_type, identity_verification_status)
SELECT p.id, p.identity_number, p.identity_type, COALESCE(p.identity_verification_status, 'pending')
FROM public.profiles p
WHERE p.identity_number IS NOT NULL
   OR p.identity_type IS NOT NULL
   OR p.identity_verification_status IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 3. Grants (owner + admins via RLS; service_role for edge functions)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_identity TO authenticated;
GRANT ALL ON public.profile_identity TO service_role;

-- 4. Enable RLS
ALTER TABLE public.profile_identity ENABLE ROW LEVEL SECURITY;

-- 5. Policies: owner + super_admin/super_assistant only
CREATE POLICY "Owner can view own identity"
  ON public.profile_identity FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Owner can insert own identity"
  ON public.profile_identity FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Owner can update own identity"
  ON public.profile_identity FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all identities"
  ON public.profile_identity FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'super_assistant'));

CREATE POLICY "Admins can update any identity"
  ON public.profile_identity FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'super_assistant'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'super_assistant'));

-- 6. updated_at trigger
DROP TRIGGER IF EXISTS trg_profile_identity_updated_at ON public.profile_identity;
CREATE TRIGGER trg_profile_identity_updated_at
  BEFORE UPDATE ON public.profile_identity
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Rewrite get_my_identity() to read from profile_identity
CREATE OR REPLACE FUNCTION public.get_my_identity()
RETURNS TABLE(identity_number text, identity_type text, identity_verification_status text, identity_verified boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT pi.identity_number, pi.identity_type, pi.identity_verification_status, p.identity_verified
    FROM public.profiles p
    LEFT JOIN public.profile_identity pi ON pi.id = p.id
    WHERE p.id = auth.uid();
END;
$$;

-- 8. Rewrite admin_list_identity_verifications() to read from profile_identity
CREATE OR REPLACE FUNCTION public.admin_list_identity_verifications()
RETURNS TABLE(id uuid, display_name text, identity_number text, identity_type text, identity_verified boolean, identity_verification_status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'super_assistant')) THEN
    PERFORM public.log_admin_access_violation('admin_list_identity_verifications');
    RAISE EXCEPTION 'super_admin role required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT p.id, p.display_name, pi.identity_number, pi.identity_type, p.identity_verified, pi.identity_verification_status
    FROM public.profiles p
    JOIN public.profile_identity pi ON pi.id = p.id
    WHERE pi.identity_number IS NOT NULL;
END;
$$;

-- 9. Drop sensitive columns from profiles (finalizes the security fix)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS identity_number;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS identity_type;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS identity_verification_status;
