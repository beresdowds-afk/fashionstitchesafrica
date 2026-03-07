
CREATE TABLE public.org_fee_exemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  exemption_type text NOT NULL,
  reason text,
  granted_by text,
  granted_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(org_id, exemption_type)
);

ALTER TABLE public.org_fee_exemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage exemptions"
ON public.org_fee_exemptions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Org admins can view their exemptions"
ON public.org_fee_exemptions
FOR SELECT
TO authenticated
USING (public.is_org_admin(auth.uid(), org_id));
