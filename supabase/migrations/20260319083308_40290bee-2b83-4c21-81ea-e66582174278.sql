-- Fix: Change platform_fee_ledger SELECT policy to use is_org_admin instead of is_org_member
DROP POLICY IF EXISTS "Org admins can view their fee ledger" ON public.platform_fee_ledger;

CREATE POLICY "Org admins can view their fee ledger"
  ON public.platform_fee_ledger FOR SELECT TO authenticated
  USING (
    public.is_org_admin(auth.uid(), org_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );
