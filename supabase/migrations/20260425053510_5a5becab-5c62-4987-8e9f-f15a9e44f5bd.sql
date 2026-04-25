-- Track the free SENTINEL-SHIELD activation request lifecycle
CREATE TABLE public.sentinel_shield_activation (
  id INTEGER PRIMARY KEY DEFAULT 1,
  client_email TEXT NOT NULL DEFAULT 'sentinel-mcp@eastforte.org.ng',
  plan_key TEXT NOT NULL DEFAULT 'sentinel_shield_free',
  status TEXT NOT NULL DEFAULT 'not_requested', -- not_requested|requested|active|failed
  requested_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  request_payload JSONB,
  provider_response JSONB,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shield_single_row CHECK (id = 1)
);

ALTER TABLE public.sentinel_shield_activation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage shield activation"
  ON public.sentinel_shield_activation FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_sentinel_shield_activation_updated_at
  BEFORE UPDATE ON public.sentinel_shield_activation
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.sentinel_shield_activation (id, status)
VALUES (1, 'not_requested')
ON CONFLICT (id) DO NOTHING;

-- Register the free SENTINEL-SHIELD platform add-on (visible in catalog, $0)
INSERT INTO public.sentinel_mcp_addons
  (addon_key, name, description, category, monthly_price_usd, per_request_price_usd, available_to_roles, mcp_tool_name, metadata)
VALUES (
  'sentinel_shield_free',
  'SENTINEL-SHIELD (Platform)',
  'Free platform-level baseline protection bundle from Sentinel MCP for FYSORA FASHN as a non-fee-paying client. Covers WAF rules, abuse detection, DDoS shielding, and audit forwarding for the platform itself. Does NOT extend to organization, designer, or tailor users — they must subscribe to paid Security Scans / Observability add-ons individually.',
  'security',
  0.00,
  NULL,
  ARRAY['super_admin'],
  'sentinel_shield_activate',
  '{"platform_only": true, "non_fee_paying": true}'::jsonb
)
ON CONFLICT (addon_key) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      monthly_price_usd = EXCLUDED.monthly_price_usd,
      available_to_roles = EXCLUDED.available_to_roles,
      mcp_tool_name = EXCLUDED.mcp_tool_name,
      metadata = EXCLUDED.metadata;