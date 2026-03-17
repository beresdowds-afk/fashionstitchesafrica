
CREATE OR REPLACE FUNCTION public.auto_grant_exemptions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF UPPER(TRIM(NEW.name)) LIKE '%GABULK FASHION STUDI%' THEN
    INSERT INTO public.org_fee_exemptions (org_id, exemption_type, reason, granted_by)
    VALUES
      (NEW.id, 'registration', 'Complimentary access granted by platform admin', 'system'),
      (NEW.id, 'website_builder', 'Complimentary access granted by platform admin', 'system'),
      (NEW.id, 'website_builder_pro', 'Complimentary Pro website access granted by platform admin', 'system'),
      (NEW.id, 'mobile_app', 'Complimentary access granted by platform admin', 'system'),
      (NEW.id, 'custom_domain_external', 'Allowed to provide own external domain under Website Builder Pro plan', 'system')
    ON CONFLICT (org_id, exemption_type) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;
