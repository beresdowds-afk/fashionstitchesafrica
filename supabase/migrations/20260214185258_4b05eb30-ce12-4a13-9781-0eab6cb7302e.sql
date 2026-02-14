
-- Exchange rates table for currency conversion
CREATE TABLE public.exchange_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency text NOT NULL DEFAULT 'NGN',
  target_currency text NOT NULL,
  rate numeric NOT NULL,
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE UNIQUE INDEX idx_exchange_rates_pair ON public.exchange_rates (base_currency, target_currency);
CREATE INDEX idx_exchange_rates_fetched ON public.exchange_rates (fetched_at DESC);

-- Enable RLS
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

-- Everyone can read exchange rates (public data)
CREATE POLICY "Anyone can view exchange rates"
ON public.exchange_rates FOR SELECT
USING (true);

-- Only super admins can manage rates
CREATE POLICY "Super admins can manage exchange rates"
ON public.exchange_rates FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));
