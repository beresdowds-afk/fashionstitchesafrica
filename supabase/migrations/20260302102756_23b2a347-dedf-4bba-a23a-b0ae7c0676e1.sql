
-- Premium feature usage tracking for hybrid billing
CREATE TABLE public.premium_feature_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  feature_type text NOT NULL, -- 'ai_measurement', 'virtual_tryon', 'video_call'
  session_id uuid, -- links to ai_measurement_bookings.id or other session tables
  credits_used numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  is_included boolean NOT NULL DEFAULT false, -- true if covered by subscription tier
  billed_to text NOT NULL DEFAULT 'user', -- 'user', 'org', 'platform'
  status text NOT NULL DEFAULT 'completed',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.premium_feature_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own usage"
ON public.premium_feature_usage FOR SELECT
USING (user_id = auth.uid() OR is_org_member(auth.uid(), org_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "System can insert usage records"
ON public.premium_feature_usage FOR INSERT
WITH CHECK (user_id = auth.uid() OR is_org_member(auth.uid(), org_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can manage usage"
ON public.premium_feature_usage FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_premium_usage_org ON public.premium_feature_usage(org_id);
CREATE INDEX idx_premium_usage_user ON public.premium_feature_usage(user_id);
CREATE INDEX idx_premium_usage_feature ON public.premium_feature_usage(feature_type);

-- Virtual try-on sessions table
CREATE TABLE public.virtual_tryon_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL,
  input_image_url text, -- customer photo
  garment_description text, -- what to try on
  result_image_url text, -- AI-generated try-on image
  measurement_profile_id uuid REFERENCES public.measurement_profiles(id),
  status text NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.virtual_tryon_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can view their own sessions"
ON public.virtual_tryon_sessions FOR SELECT
USING (customer_id = auth.uid() OR is_org_member(auth.uid(), org_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can create tryon sessions"
ON public.virtual_tryon_sessions FOR INSERT
WITH CHECK (customer_id = auth.uid() OR is_org_member(auth.uid(), org_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can update their own sessions"
ON public.virtual_tryon_sessions FOR UPDATE
USING (customer_id = auth.uid() OR is_org_admin(auth.uid(), org_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Add premium feature config to subscription_plans
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS included_ai_measurements integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS included_virtual_tryons integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS included_video_minutes integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_measurement_price numeric DEFAULT 2.00,
  ADD COLUMN IF NOT EXISTS virtual_tryon_price numeric DEFAULT 1.50,
  ADD COLUMN IF NOT EXISTS video_minute_price numeric DEFAULT 0.10;

-- Enable realtime for usage tracking
ALTER PUBLICATION supabase_realtime ADD TABLE public.premium_feature_usage;
ALTER PUBLICATION supabase_realtime ADD TABLE public.virtual_tryon_sessions;

-- Storage bucket for try-on images
INSERT INTO storage.buckets (id, name, public) VALUES ('tryon-images', 'tryon-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view tryon images"
ON storage.objects FOR SELECT
USING (bucket_id = 'tryon-images');

CREATE POLICY "Authenticated users can upload tryon images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'tryon-images' AND auth.uid() IS NOT NULL);
