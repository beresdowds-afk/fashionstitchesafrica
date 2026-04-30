
-- 1. Platform agents table (mirrors sentinel_shield_activation pattern, multi-row)
CREATE TABLE IF NOT EXISTS public.sentinel_platform_agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_key TEXT NOT NULL UNIQUE,
  agent_name TEXT NOT NULL,
  service_category TEXT NOT NULL,
  description TEXT,
  client_email TEXT NOT NULL DEFAULT 'sentinel-mcp@eastforte.org.ng',
  plan_key TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'non_fee_paying',
  scope TEXT NOT NULL DEFAULT 'platform_only',
  cascades_to_users BOOLEAN NOT NULL DEFAULT false,
  mcp_tool_name TEXT NOT NULL,
  requested_features JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'not_requested',
  requested_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  request_payload JSONB,
  provider_response JSONB,
  last_error TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 6,
  last_attempt_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  stuck_after_minutes INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sentinel_platform_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage sentinel platform agents"
ON public.sentinel_platform_agents
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_sentinel_platform_agents_updated
BEFORE UPDATE ON public.sentinel_platform_agents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Seed Steven-AI and Rachel CRM
INSERT INTO public.sentinel_platform_agents
  (agent_key, agent_name, service_category, description, plan_key, mcp_tool_name, requested_features)
VALUES
  ('steven_ai',
   'Steven-AI',
   'business_account_management',
   'Sentinel MCP business operations & account-management agent for FYSORA FASHN. Handles ledger reconciliation, subscription lifecycle health, and back-office automations.',
   'STEVEN-AI-PLATFORM',
   'steven_ai_engage',
   '["account_health_monitoring","subscription_lifecycle","ledger_reconciliation","invoice_intelligence","ops_automation"]'::jsonb),
  ('rachel_crm',
   'Rachel CRM',
   'customer_relations',
   'Sentinel MCP customer-relations agent for FYSORA FASHN. Handles customer journey orchestration, retention nudges, and relationship intelligence at the platform tier.',
   'RACHEL-CRM-PLATFORM',
   'rachel_crm_engage',
   '["customer_journey_orchestration","retention_signals","churn_alerts","relationship_intelligence","support_triage"]'::jsonb)
ON CONFLICT (agent_key) DO NOTHING;

-- 3. New paid Cloud Storage add-on for orgs & designers
INSERT INTO public.sentinel_mcp_addons
  (addon_key, name, description, category, monthly_price_usd, per_request_price_usd,
   available_to_roles, mcp_tool_name, is_active, metadata)
VALUES
  ('cloud_storage',
   'Sentinel Multi-Cloud Storage',
   'Multi-cloud object storage powered by Sentinel MCP — replicated across AWS S3, GCP GCS and Cloudflare R2 with automatic failover. Includes encryption-at-rest, signed URLs and CDN edge caching. $12/month base includes 50GB; additional storage billed at $0.025/GB.',
   'reliability',
   12.00,
   NULL,
   ARRAY['org_admin','designer','manager'],
   'sentinel_storage_provision',
   true,
   jsonb_build_object(
     'included_gb', 50,
     'overage_per_gb_usd', 0.025,
     'providers', jsonb_build_array('aws_s3','gcp_gcs','cloudflare_r2'),
     'features', jsonb_build_array('multi_region_replication','signed_urls','edge_cdn','encryption_at_rest','versioning'),
     'subscribable_by', jsonb_build_array('organization','designer')
   ))
ON CONFLICT (addon_key) DO UPDATE SET
  description = EXCLUDED.description,
  monthly_price_usd = EXCLUDED.monthly_price_usd,
  available_to_roles = EXCLUDED.available_to_roles,
  metadata = EXCLUDED.metadata,
  is_active = true;
