
-- =============================================
-- Platform Disclaimer Acknowledgments
-- =============================================
CREATE TABLE public.disclaimer_acknowledgments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  acknowledgment_type text NOT NULL DEFAULT 'platform_terms',
  disclaimer_version text NOT NULL DEFAULT '1.0',
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  context text NOT NULL DEFAULT 'registration',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, acknowledgment_type, disclaimer_version)
);

ALTER TABLE public.disclaimer_acknowledgments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own acknowledgments" ON public.disclaimer_acknowledgments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can insert own acknowledgments" ON public.disclaimer_acknowledgments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Super admins can view all" ON public.disclaimer_acknowledgments
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- =============================================
-- Billing Query Log (for unified billing queries)
-- =============================================
CREATE TABLE public.billing_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  query_type text NOT NULL DEFAULT 'general',
  subject text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  category text NOT NULL DEFAULT 'billing',
  related_order_id uuid REFERENCES public.orders(id),
  related_payment_id uuid,
  related_subscription_id uuid,
  resolution_notes text,
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own queries" ON public.billing_queries
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR (org_id IS NOT NULL AND is_org_admin(auth.uid(), org_id)) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (user_id = auth.uid() OR (org_id IS NOT NULL AND is_org_admin(auth.uid(), org_id)) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_billing_queries_updated_at BEFORE UPDATE ON public.billing_queries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
