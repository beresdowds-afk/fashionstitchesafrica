
-- Create a trigger function that auto-grants exemptions for pre-approved organizations
CREATE OR REPLACE FUNCTION public.auto_grant_exemptions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- GABULK FASHION STUDIOS exemptions: free registration, website, and app
  IF UPPER(TRIM(NEW.name)) LIKE '%GABULK FASHION STUDIOS%' THEN
    INSERT INTO public.org_fee_exemptions (org_id, exemption_type, reason, granted_by)
    VALUES
      (NEW.id, 'registration', 'Complimentary access granted by platform admin', 'system'),
      (NEW.id, 'website_builder', 'Complimentary access granted by platform admin', 'system'),
      (NEW.id, 'mobile_app', 'Complimentary access granted by platform admin', 'system')
    ON CONFLICT (org_id, exemption_type) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger to organizations table
CREATE TRIGGER trg_auto_grant_exemptions
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_grant_exemptions();
