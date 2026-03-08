
-- Support requests table for users requesting super admin help with payment gateway setup
CREATE TABLE public.admin_support_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL DEFAULT 'payment_gateway_setup',
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_support_requests ENABLE ROW LEVEL SECURITY;

-- Users can see their own requests
CREATE POLICY "Users can view own support requests"
  ON public.admin_support_requests FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can create their own support requests
CREATE POLICY "Users can create support requests"
  ON public.admin_support_requests FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Super admins can view all
CREATE POLICY "Super admins can view all support requests"
  ON public.admin_support_requests FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Super admins can update
CREATE POLICY "Super admins can update support requests"
  ON public.admin_support_requests FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Org admins can manage keys for their org
CREATE POLICY "Org admins can manage own api keys"
  ON public.org_api_keys FOR ALL
  TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id))
  WITH CHECK (public.is_org_admin(auth.uid(), org_id));
