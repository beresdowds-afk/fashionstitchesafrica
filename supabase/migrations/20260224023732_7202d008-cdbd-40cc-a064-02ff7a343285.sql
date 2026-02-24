
-- Website Pricing Config table (stores versioned snapshots of pricing)
CREATE TABLE public.website_pricing_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.website_pricing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage pricing config"
  ON public.website_pricing_config FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Org admins can view pricing config"
  ON public.website_pricing_config FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Website Pricing History table (audit log of individual field changes)
CREATE TABLE public.website_pricing_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id uuid REFERENCES public.website_pricing_config(id) ON DELETE SET NULL,
  plan text NOT NULL,
  field text NOT NULL,
  old_value text NOT NULL,
  new_value text NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.website_pricing_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage pricing history"
  ON public.website_pricing_history FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Authenticated users can view pricing history"
  ON public.website_pricing_history FOR SELECT
  USING (auth.uid() IS NOT NULL);
