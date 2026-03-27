
-- Verification attempts tracking with provider routing
CREATE TABLE public.identity_verification_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('profile', 'organization')),
  entity_id UUID NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('smile_id', 'youverify', 'identitypass', 'persona', 'local')),
  verification_type TEXT NOT NULL,
  id_type TEXT,
  id_number_masked TEXT,
  country TEXT DEFAULT 'NG',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'verified', 'failed', 'expired')),
  confidence_score NUMERIC(5,2),
  provider_reference TEXT,
  provider_response JSONB,
  cost_usd NUMERIC(10,4) DEFAULT 0,
  biometrics_used TEXT[] DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Verification provider configuration
CREATE TABLE public.verification_provider_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL UNIQUE CHECK (provider IN ('smile_id', 'youverify', 'identitypass', 'persona')),
  display_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  priority INT DEFAULT 0,
  supported_countries TEXT[] DEFAULT '{}',
  supported_id_types TEXT[] DEFAULT '{}',
  supported_entity_types TEXT[] DEFAULT ARRAY['profile', 'organization'],
  cost_per_verification NUMERIC(10,4) DEFAULT 0,
  config JSONB DEFAULT '{}',
  monthly_limit INT DEFAULT 1000,
  monthly_used INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.identity_verification_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_provider_config ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view their own verification attempts
CREATE POLICY "Users view own verifications"
  ON public.identity_verification_attempts FOR SELECT
  TO authenticated
  USING (entity_id = auth.uid());

-- RLS: Super admins can view all verification attempts
CREATE POLICY "Admins view all verifications"
  ON public.identity_verification_attempts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- RLS: Only edge functions insert (via service role)
CREATE POLICY "Service insert verifications"
  ON public.identity_verification_attempts FOR INSERT
  TO service_role
  WITH CHECK (true);

-- RLS: Provider config readable by super admins
CREATE POLICY "Admins manage provider config"
  ON public.verification_provider_config FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Seed provider configurations
INSERT INTO public.verification_provider_config (provider, display_name, is_active, priority, supported_countries, supported_id_types, cost_per_verification) VALUES
  ('smile_id', 'Smile ID', false, 1, ARRAY['NG','GH','KE','ZA','UG','TZ','RW','SN','CI'], ARRAY['nin','bvn','passport','drivers_license','voters_card','ghana_card','kenyan_id','sa_id'], 1.00),
  ('youverify', 'YouVerify', false, 2, ARRAY['NG','GH','KE','ZA'], ARRAY['nin','bvn','passport','drivers_license','voters_card'], 0.75),
  ('identitypass', 'IdentityPass', false, 3, ARRAY['NG','GH','KE'], ARRAY['nin','bvn','passport','drivers_license','voters_card'], 0.30),
  ('persona', 'Persona', false, 4, ARRAY['US','GB','CA','AU','FR','DE'], ARRAY['passport','drivers_license','national_id'], 2.00);

-- Updated_at trigger
CREATE TRIGGER update_verification_attempts_updated_at
  BEFORE UPDATE ON public.identity_verification_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_verification_provider_config_updated_at
  BEFORE UPDATE ON public.verification_provider_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
