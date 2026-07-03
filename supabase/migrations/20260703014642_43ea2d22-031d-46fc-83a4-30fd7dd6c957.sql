-- 1. Drop the over-broad anon policy that exposed all columns
DROP POLICY IF EXISTS "Anon can read active orgs summary" ON public.organizations;

-- 2. Rebuild the summary view as SECURITY DEFINER so anon reads work through
-- the curated column list without needing direct RLS access to organizations.
DROP VIEW IF EXISTS public.organizations_summary;
CREATE VIEW public.organizations_summary
WITH (security_invoker = false) AS
SELECT id, name, slug, logo_url, is_active, country, region
  FROM public.organizations
 WHERE is_active = true;

GRANT SELECT ON public.organizations_summary TO anon, authenticated;