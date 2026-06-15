
-- External integrations registry: non-native domains, external API endpoints, companion PWA backends
CREATE TABLE public.external_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('domain','external_api','companion_pwa','webhook_consumer','worker')),
  name text NOT NULL,
  base_url text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  allowed_origins text[] NOT NULL DEFAULT '{}',
  proxy_enabled boolean NOT NULL DEFAULT false,
  hmac_secret_name text,
  auth_passthrough boolean NOT NULL DEFAULT true,
  rate_limit_per_minute integer DEFAULT 120,
  health_status text NOT NULL DEFAULT 'unknown',
  last_health_check_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_integrations TO authenticated;
GRANT ALL ON public.external_integrations TO service_role;

ALTER TABLE public.external_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage external integrations"
ON public.external_integrations FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'super_assistant'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER update_external_integrations_updated_at
BEFORE UPDATE ON public.external_integrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Inbound webhook deliveries from external systems (companion PWA, etc.)
CREATE TABLE public.external_inbound_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid REFERENCES public.external_integrations(id) ON DELETE SET NULL,
  source text NOT NULL,
  event_type text NOT NULL,
  signature text,
  signature_valid boolean,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  error text,
  received_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.external_inbound_webhooks TO authenticated;
GRANT ALL ON public.external_inbound_webhooks TO service_role;

ALTER TABLE public.external_inbound_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins view inbound webhooks"
ON public.external_inbound_webhooks FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'super_assistant'));

-- Seed FYSORA Companion PWA backend
INSERT INTO public.external_integrations (kind, name, base_url, description, allowed_origins, proxy_enabled, hmac_secret_name, metadata)
VALUES (
  'companion_pwa',
  'FYSORA Companion PWA Backend',
  'https://api.fs-africa.org.ng',
  'Backend API powering the FYSORA Companion PWA (auth, orders, AI measurement, virtual try-on, payments, WhatsApp, push notifications)',
  ARRAY['https://fashionstitchesafrica.lovable.app','https://www.fs-africa.org.ng','https://companion.fs-africa.org.ng'],
  true,
  'FYSORA_COMPANION_WEBHOOK_SECRET',
  jsonb_build_object(
    'nodes', jsonb_build_array(
      'api_server','database','auth_service','file_storage','ai_processing',
      'payment_gateway','whatsapp_service','push_notifications','cache_layer',
      'load_balancer','logging_monitoring'
    ),
    'frontend', jsonb_build_object(
      'static_host', 'cdn',
      'service_worker_path', '/sw.js',
      'sw_allowed_header', true
    )
  )
);
