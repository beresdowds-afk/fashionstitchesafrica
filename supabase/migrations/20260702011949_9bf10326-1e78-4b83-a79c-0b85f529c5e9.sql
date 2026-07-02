
-- 1. Catalogue size charts
ALTER TABLE public.org_catalogue_items
  ADD COLUMN IF NOT EXISTS size_chart_standard TEXT DEFAULT 'UK',
  ADD COLUMN IF NOT EXISTS available_sizes TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS size_chart JSONB DEFAULT '{}'::jsonb;

-- 2. Cart / order item size capture
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS selected_size TEXT,
  ADD COLUMN IF NOT EXISTS size_standard TEXT;

-- 3. Convert the two flagged views to standard (invoker) semantics + add
--    explicit anon SELECT policies scoped to active/enabled rows so public
--    tenant sites keep resolving without exposing private columns.
ALTER VIEW public.organizations_summary SET (security_invoker = true);
ALTER VIEW public.org_websites_public   SET (security_invoker = true);

DROP POLICY IF EXISTS "Anon can read active orgs summary" ON public.organizations;
CREATE POLICY "Anon can read active orgs summary"
  ON public.organizations FOR SELECT TO anon
  USING (is_active = true);

DROP POLICY IF EXISTS "Anon can read enabled org websites" ON public.org_websites;
CREATE POLICY "Anon can read enabled org websites"
  ON public.org_websites FOR SELECT TO anon
  USING (is_enabled = true);

GRANT SELECT ON public.organizations TO anon;
GRANT SELECT ON public.org_websites TO anon;

-- 4. Defensive: ensure the loose "Org members can …" policies on the
--    org-assets bucket never return. (Idempotent — safe on already-clean DBs.)
DROP POLICY IF EXISTS "Org members can upload assets"  ON storage.objects;
DROP POLICY IF EXISTS "Org members can update assets"  ON storage.objects;
DROP POLICY IF EXISTS "Org members can delete assets"  ON storage.objects;
