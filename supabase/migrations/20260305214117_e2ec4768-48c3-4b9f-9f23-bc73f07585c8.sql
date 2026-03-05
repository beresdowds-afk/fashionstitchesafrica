
-- Tailor catalogue items table (separate from org garment_catalog)
CREATE TABLE public.tailor_catalogue_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id uuid NOT NULL,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text DEFAULT 'general',
  image_url text,
  price numeric,
  currency text DEFAULT 'NGN',
  tags text[] DEFAULT '{}',
  is_published boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'manual',
  source_url text,
  social_platform text,
  social_post_id text,
  tryon_enabled boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tailor_catalogue_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tailors can manage own items" ON public.tailor_catalogue_items
  FOR ALL TO authenticated
  USING (tailor_id = auth.uid() OR (org_id IS NOT NULL AND is_org_admin(auth.uid(), org_id)) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (tailor_id = auth.uid() OR (org_id IS NOT NULL AND is_org_admin(auth.uid(), org_id)) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Anyone can view published tailor items" ON public.tailor_catalogue_items
  FOR SELECT TO authenticated
  USING (is_published = true OR tailor_id = auth.uid() OR (org_id IS NOT NULL AND is_org_member(auth.uid(), org_id)) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Social sync configurations
CREATE TABLE public.social_sync_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  owner_type text NOT NULL DEFAULT 'organization',
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  platform text NOT NULL,
  account_handle text,
  account_url text,
  sync_direction text NOT NULL DEFAULT 'both',
  is_enabled boolean NOT NULL DEFAULT false,
  auto_publish boolean NOT NULL DEFAULT false,
  last_synced_at timestamptz,
  sync_status text DEFAULT 'idle',
  sync_frequency text DEFAULT 'daily',
  content_filter jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id, platform)
);

ALTER TABLE public.social_sync_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage own sync configs" ON public.social_sync_configs
  FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR (org_id IS NOT NULL AND is_org_admin(auth.uid(), org_id)) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (owner_id = auth.uid() OR (org_id IS NOT NULL AND is_org_admin(auth.uid(), org_id)) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Add public deployment gate to org_app_configs
ALTER TABLE public.org_app_configs
  ADD COLUMN IF NOT EXISTS is_public_deployment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_deployment_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS public_deployment_approved_by uuid,
  ADD COLUMN IF NOT EXISTS app_store_url text,
  ADD COLUMN IF NOT EXISTS api_access_enabled boolean NOT NULL DEFAULT false;

-- Add tailor social media columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS facebook_url text,
  ADD COLUMN IF NOT EXISTS twitter_url text,
  ADD COLUMN IF NOT EXISTS tiktok_url text,
  ADD COLUMN IF NOT EXISTS youtube_url text,
  ADD COLUMN IF NOT EXISTS linkedin_url text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS specialty text,
  ADD COLUMN IF NOT EXISTS portfolio_url text;
