
-- FYSORA Insurance — Batch 1 foundation

DO $$ BEGIN CREATE TYPE public.insurance_policy_type AS ENUM ('order_protection','contract_assurance'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.insurance_policy_status AS ENUM ('active','claimed','expired','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.insurance_claim_type AS ENUM ('delivery_failure','wrong_item','quality_issue','measurement_error','fraud','non_delivery'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.insurance_claim_status AS ENUM ('submitted','reviewing','approved','partial_approved','rejected','paid','expired','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.insurance_risk_tier AS ENUM ('low','medium','high','very_high'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.insurance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_number TEXT UNIQUE NOT NULL DEFAULT ('FOP-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  contract_id UUID REFERENCES public.tailor_contracts(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  tailor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  policy_type public.insurance_policy_type NOT NULL,
  premium_amount NUMERIC(12,2) NOT NULL CHECK (premium_amount >= 0),
  coverage_limit NUMERIC(12,2) NOT NULL CHECK (coverage_limit >= 0),
  excess_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (excess_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'NGN',
  status public.insurance_policy_status NOT NULL DEFAULT 'active',
  start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_date TIMESTAMPTZ,
  terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  feature_flag_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.insurance_policies TO authenticated;
GRANT ALL ON public.insurance_policies TO service_role;
ALTER TABLE public.insurance_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ip_customer_select" ON public.insurance_policies FOR SELECT TO authenticated USING (customer_id = auth.uid());
CREATE POLICY "ip_org_select" ON public.insurance_policies FOR SELECT TO authenticated USING (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "ip_tailor_select" ON public.insurance_policies FOR SELECT TO authenticated USING (tailor_id = auth.uid());
CREATE POLICY "ip_admin_all" ON public.insurance_policies FOR ALL TO authenticated USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'super_assistant')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE INDEX IF NOT EXISTS idx_ip_order ON public.insurance_policies(order_id);
CREATE INDEX IF NOT EXISTS idx_ip_contract ON public.insurance_policies(contract_id);
CREATE INDEX IF NOT EXISTS idx_ip_customer ON public.insurance_policies(customer_id);
CREATE INDEX IF NOT EXISTS idx_ip_org ON public.insurance_policies(organization_id);
CREATE INDEX IF NOT EXISTS idx_ip_status ON public.insurance_policies(status);
CREATE TRIGGER trg_ip_updated BEFORE UPDATE ON public.insurance_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.insurance_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number TEXT UNIQUE NOT NULL DEFAULT ('FCL-' || to_char(now(),'YYYYMMDD') || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,8)),
  policy_id UUID NOT NULL REFERENCES public.insurance_policies(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  tailor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  claim_type public.insurance_claim_type NOT NULL,
  description TEXT,
  evidence_urls TEXT[] NOT NULL DEFAULT '{}',
  status public.insurance_claim_status NOT NULL DEFAULT 'submitted',
  amount_claimed NUMERIC(12,2),
  amount_approved NUMERIC(12,2),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  rejection_reason TEXT,
  resolution_notes TEXT,
  respondent_response TEXT,
  respondent_evidence_urls TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.insurance_claims TO authenticated;
GRANT ALL ON public.insurance_claims TO service_role;
ALTER TABLE public.insurance_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ic_customer_select" ON public.insurance_claims FOR SELECT TO authenticated USING (customer_id = auth.uid() OR submitted_by = auth.uid());
CREATE POLICY "ic_org_select" ON public.insurance_claims FOR SELECT TO authenticated USING (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id));
CREATE POLICY "ic_tailor_select" ON public.insurance_claims FOR SELECT TO authenticated USING (tailor_id = auth.uid());
CREATE POLICY "ic_claimant_insert" ON public.insurance_claims FOR INSERT TO authenticated WITH CHECK (submitted_by = auth.uid() AND (customer_id = auth.uid() OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id))));
CREATE POLICY "ic_respondent_update" ON public.insurance_claims FOR UPDATE TO authenticated USING (tailor_id = auth.uid() OR (organization_id IS NOT NULL AND public.is_org_admin(auth.uid(), organization_id)));
CREATE POLICY "ic_admin_all" ON public.insurance_claims FOR ALL TO authenticated USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'super_assistant')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE INDEX IF NOT EXISTS idx_ic_policy ON public.insurance_claims(policy_id);
CREATE INDEX IF NOT EXISTS idx_ic_status ON public.insurance_claims(status);
CREATE TRIGGER trg_ic_updated BEFORE UPDATE ON public.insurance_claims FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.insurance_claim_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES public.insurance_claims(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  description TEXT,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.insurance_claim_actions TO authenticated;
GRANT ALL ON public.insurance_claim_actions TO service_role;
ALTER TABLE public.insurance_claim_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ica_select" ON public.insurance_claim_actions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.insurance_claims c WHERE c.id = claim_id AND (
    c.customer_id = auth.uid() OR c.submitted_by = auth.uid() OR c.tailor_id = auth.uid()
    OR (c.organization_id IS NOT NULL AND public.is_org_member(auth.uid(), c.organization_id))
    OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'super_assistant')
  ))
);
CREATE POLICY "ica_insert" ON public.insurance_claim_actions FOR INSERT TO authenticated WITH CHECK (performed_by = auth.uid());
CREATE INDEX IF NOT EXISTS idx_ica_claim ON public.insurance_claim_actions(claim_id);

CREATE TABLE IF NOT EXISTS public.insurance_risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('tailor','organization')),
  tailor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  tier public.insurance_risk_tier NOT NULL,
  factors JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  CONSTRAINT risk_subject_one_of CHECK (
    (subject_type = 'tailor' AND tailor_id IS NOT NULL AND organization_id IS NULL)
    OR (subject_type = 'organization' AND organization_id IS NOT NULL AND tailor_id IS NULL)
  )
);
GRANT SELECT ON public.insurance_risk_scores TO authenticated;
GRANT ALL ON public.insurance_risk_scores TO service_role;
ALTER TABLE public.insurance_risk_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "irs_select" ON public.insurance_risk_scores FOR SELECT TO authenticated USING (
  tailor_id = auth.uid()
  OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id))
  OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'super_assistant')
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_risk_tailor ON public.insurance_risk_scores(tailor_id) WHERE subject_type = 'tailor';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_risk_org ON public.insurance_risk_scores(organization_id) WHERE subject_type = 'organization';

CREATE TABLE IF NOT EXISTS public.insurance_reserve_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES public.insurance_policies(id) ON DELETE SET NULL,
  claim_id UUID REFERENCES public.insurance_claims(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  source TEXT NOT NULL CHECK (source IN ('premium','administration_fee','platform_fee','payout','adjustment','topup')),
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','allocated','used','reversed')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.insurance_reserve_ledger TO authenticated;
GRANT ALL ON public.insurance_reserve_ledger TO service_role;
ALTER TABLE public.insurance_reserve_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "irl_admin_all" ON public.insurance_reserve_ledger FOR ALL TO authenticated USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'super_assistant')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE INDEX IF NOT EXISTS idx_irl_policy ON public.insurance_reserve_ledger(policy_id);
CREATE INDEX IF NOT EXISTS idx_irl_claim ON public.insurance_reserve_ledger(claim_id);

CREATE TABLE IF NOT EXISTS public.insurance_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key TEXT UNIQUE NOT NULL,
  flag_name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  phase INTEGER NOT NULL CHECK (phase BETWEEN 1 AND 6),
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.insurance_feature_flags TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON public.insurance_feature_flags TO authenticated;
GRANT ALL ON public.insurance_feature_flags TO service_role;
ALTER TABLE public.insurance_feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "iff_read_all" ON public.insurance_feature_flags FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "iff_admin_write" ON public.insurance_feature_flags FOR ALL TO authenticated USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER trg_iff_updated BEFORE UPDATE ON public.insurance_feature_flags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.insurance_feature_flags (flag_key, flag_name, description, phase) VALUES
  ('order_protection','Phase 1: Order Protection','Customer opt-in protection at checkout',1),
  ('escrow_protection','Phase 2: Escrow + Protection','Escrow integration with insurance layer',2),
  ('risk_engine','Phase 3: Reputation Risk Engine','Dynamic risk-based pricing',3),
  ('contract_insurance','Phase 4: Contract Insurance','High-value contract coverage',4),
  ('ai_measurement_guarantee','Phase 5: AI Measurement Guarantee','Perfect Fit Guarantee',5),
  ('insurer_partner','Phase 6: Licensed Insurer Partner','Integration with licensed insurers',6)
ON CONFLICT (flag_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.insurance_config (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  fee_min_percent NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  fee_max_percent NUMERIC(5,2) NOT NULL DEFAULT 5.0,
  reserve_percent NUMERIC(5,2) NOT NULL DEFAULT 60.0,
  administration_percent NUMERIC(5,2) NOT NULL DEFAULT 20.0,
  platform_percent NUMERIC(5,2) NOT NULL DEFAULT 20.0,
  claims_window_days INTEGER NOT NULL DEFAULT 14,
  min_order_value NUMERIC(12,2) NOT NULL DEFAULT 10000,
  max_coverage_per_claim NUMERIC(12,2) NOT NULL DEFAULT 500000,
  default_excess NUMERIC(12,2) NOT NULL DEFAULT 0,
  risk_threshold_low INTEGER NOT NULL DEFAULT 30,
  risk_threshold_medium INTEGER NOT NULL DEFAULT 60,
  risk_threshold_high INTEGER NOT NULL DEFAULT 80,
  fee_multiplier_low NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  fee_multiplier_medium NUMERIC(4,2) NOT NULL DEFAULT 1.5,
  fee_multiplier_high NUMERIC(4,2) NOT NULL DEFAULT 2.0,
  fee_multiplier_very_high NUMERIC(4,2) NOT NULL DEFAULT 3.0,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.insurance_config TO authenticated, anon;
GRANT INSERT, UPDATE ON public.insurance_config TO authenticated;
GRANT ALL ON public.insurance_config TO service_role;
ALTER TABLE public.insurance_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "iconf_read_all" ON public.insurance_config FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "iconf_admin_write" ON public.insurance_config FOR ALL TO authenticated USING (public.has_role(auth.uid(),'super_admin')) WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER trg_iconf_updated BEFORE UPDATE ON public.insurance_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.insurance_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
