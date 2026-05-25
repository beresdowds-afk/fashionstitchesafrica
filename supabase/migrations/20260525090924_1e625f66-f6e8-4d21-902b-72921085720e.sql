CREATE OR REPLACE FUNCTION public.assign_role(_role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _role IN ('super_admin', 'super_assistant', 'platform_management') THEN
    RAISE EXCEPTION 'Cannot self-assign privileged role %', _role;
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, _role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_eastforte_super_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _email text;
BEGIN
  SELECT lower(email) INTO _email FROM auth.users WHERE id = NEW.id;
  IF _email = 'eastforte2@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'platform_management')
      ON CONFLICT (user_id, role) DO NOTHING;
    NEW.access_status := 'active';
    NEW.access_status_notes := COALESCE(NEW.access_status_notes, 'Permanent super admin access (locked)');
    NEW.access_status_reviewed_at := COALESCE(NEW.access_status_reviewed_at, now());
  END IF;
  RETURN NEW;
END $function$;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'platform_management'::app_role
  FROM auth.users u
 WHERE lower(u.email) = 'eastforte2@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;