-- Restore anon read access to enabled org websites via the org_websites_public view.
-- The view uses security_invoker=on (to satisfy the SECURITY DEFINER lint),
-- so anon needs a matching SELECT policy on the base table. Scope it to enabled sites only.

DROP POLICY IF EXISTS "Anon can read enabled org websites" ON public.org_websites;
CREATE POLICY "Anon can read enabled org websites"
  ON public.org_websites
  FOR SELECT
  TO anon, authenticated
  USING (is_enabled = true);

GRANT SELECT ON public.org_websites TO anon;