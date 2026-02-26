
ALTER TABLE public.website_builder_subscriptions
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS grandfathered_at timestamp with time zone;
