
-- Persist reserved role assignments by email so they auto-apply on (re)signup.
CREATE TABLE IF NOT EXISTS public.reserved_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role public.app_role NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, role)
);

GRANT SELECT ON public.reserved_role_assignments TO authenticated;
GRANT ALL ON public.reserved_role_assignments TO service_role;

ALTER TABLE public.reserved_role_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages reserved_role_assignments"
  ON public.reserved_role_assignments
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "authenticated can read reserved_role_assignments"
  ON public.reserved_role_assignments
  FOR SELECT
  TO authenticated
  USING (true);

DROP TRIGGER IF EXISTS trg_reserved_role_assignments_updated_at ON public.reserved_role_assignments;
CREATE TRIGGER trg_reserved_role_assignments_updated_at
  BEFORE UPDATE ON public.reserved_role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed the two persistent assignments.
INSERT INTO public.reserved_role_assignments (email, role, note) VALUES
  ('eastforte2@gmail.com', 'super_admin', 'Persistent platform super admin'),
  ('beresdowds@gmail.com', 'org_admin',   'Persistent platform owner (org_admin)')
ON CONFLICT (email, role) DO UPDATE SET note = EXCLUDED.note, updated_at = now();

-- Update handle_new_user so it applies reserved roles automatically on signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  clean_display_name TEXT;
  r RECORD;
BEGIN
  clean_display_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
    SPLIT_PART(NEW.email, '@', 1)
  );
  clean_display_name := LEFT(clean_display_name, 100);
  clean_display_name := REGEXP_REPLACE(clean_display_name, '[[:cntrl:]]', '', 'g');
  clean_display_name := TRANSLATE(clean_display_name, '<>"' || chr(39) || ';\', '');

  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, clean_display_name)
  ON CONFLICT (id) DO NOTHING;

  -- Apply any reserved role assignments for this email.
  FOR r IN
    SELECT role FROM public.reserved_role_assignments
    WHERE lower(email) = lower(NEW.email)
  LOOP
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, r.role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Backfill for existing users matching reserved assignments (idempotent).
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, rra.role
FROM auth.users u
JOIN public.reserved_role_assignments rra ON lower(rra.email) = lower(u.email)
ON CONFLICT (user_id, role) DO NOTHING;
