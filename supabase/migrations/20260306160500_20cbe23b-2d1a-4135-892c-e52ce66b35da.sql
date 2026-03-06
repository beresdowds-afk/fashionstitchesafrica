
CREATE TABLE public.customer_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  plan_name TEXT NOT NULL DEFAULT 'Premium Access',
  price_amount NUMERIC NOT NULL DEFAULT 10,
  price_currency TEXT NOT NULL DEFAULT 'USD',
  billing_cycle TEXT NOT NULL DEFAULT 'yearly',
  status TEXT NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '365 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscriptions
CREATE POLICY "Users can read own subscriptions"
  ON public.customer_subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can create their own subscriptions
CREATE POLICY "Users can create own subscriptions"
  ON public.customer_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own subscriptions
CREATE POLICY "Users can update own subscriptions"
  ON public.customer_subscriptions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Super admins can read all
CREATE POLICY "Super admins can read all subscriptions"
  ON public.customer_subscriptions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
