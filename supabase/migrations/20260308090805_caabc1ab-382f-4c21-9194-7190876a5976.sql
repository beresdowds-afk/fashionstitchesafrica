
-- Token packages available for purchase
CREATE TABLE public.token_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  credits INTEGER NOT NULL,
  price_amount NUMERIC NOT NULL DEFAULT 0,
  price_currency TEXT NOT NULL DEFAULT 'USD',
  bonus_credits INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  target_role TEXT NOT NULL DEFAULT 'all',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.token_packages ENABLE ROW LEVEL SECURITY;

-- Public read for active packages
CREATE POLICY "Anyone can view active token packages"
  ON public.token_packages FOR SELECT
  USING (is_active = true);

-- Super admins manage
CREATE POLICY "Super admins manage token packages"
  ON public.token_packages FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Token purchase records  
CREATE TABLE public.token_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  package_id UUID REFERENCES public.token_packages(id),
  credits_purchased INTEGER NOT NULL,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_gateway TEXT NOT NULL,
  gateway_reference TEXT,
  gateway_checkout_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.token_purchases ENABLE ROW LEVEL SECURITY;

-- Users see own purchases
CREATE POLICY "Users view own token purchases"
  ON public.token_purchases FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users create own token purchases"
  ON public.token_purchases FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Super admins see all
CREATE POLICY "Super admins view all token purchases"
  ON public.token_purchases FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Bank transfer payment records
CREATE TABLE public.bank_transfer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  purpose TEXT NOT NULL,
  reference_id UUID,
  reference_type TEXT,
  bank_name TEXT,
  account_name TEXT,
  transfer_reference TEXT,
  proof_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_transfer_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own bank transfers"
  ON public.bank_transfer_payments FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users create own bank transfers"
  ON public.bank_transfer_payments FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Org admins view org bank transfers"
  ON public.bank_transfer_payments FOR SELECT
  TO authenticated
  USING (org_id IS NOT NULL AND public.is_org_admin(auth.uid(), org_id));

CREATE POLICY "Org admins update org bank transfers"
  ON public.bank_transfer_payments FOR UPDATE
  TO authenticated
  USING (org_id IS NOT NULL AND public.is_org_admin(auth.uid(), org_id));

CREATE POLICY "Super admins manage all bank transfers"
  ON public.bank_transfer_payments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Insert default token packages
INSERT INTO public.token_packages (name, description, credits, price_amount, price_currency, bonus_credits, sort_order) VALUES
  ('Starter', 'Perfect for trying out AI features', 50, 5, 'USD', 0, 1),
  ('Basic', 'Great for regular use', 200, 15, 'USD', 20, 2),
  ('Pro', 'Best value for power users', 500, 30, 'USD', 75, 3),
  ('Enterprise', 'Maximum credits for organizations', 2000, 100, 'USD', 400, 4);
