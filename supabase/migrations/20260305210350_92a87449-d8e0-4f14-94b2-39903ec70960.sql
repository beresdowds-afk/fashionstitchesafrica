
-- Create org_company_officers table
CREATE TABLE public.org_company_officers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  title text NOT NULL,
  email text,
  phone text,
  bio text,
  photo_url text,
  display_order integer NOT NULL DEFAULT 0,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS on org_company_officers
ALTER TABLE public.org_company_officers ENABLE ROW LEVEL SECURITY;

-- Org admins can manage officers
CREATE POLICY "Org admins can manage officers"
  ON public.org_company_officers
  FOR ALL
  TO authenticated
  USING (is_org_admin(auth.uid(), org_id) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (is_org_admin(auth.uid(), org_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Public can view public officers
CREATE POLICY "Anyone can view public officers"
  ON public.org_company_officers
  FOR SELECT
  TO anon, authenticated
  USING (is_public = true);

-- Alter org_websites table for extended branding
ALTER TABLE public.org_websites
  ADD COLUMN IF NOT EXISTS font_heading text NOT NULL DEFAULT 'Inter',
  ADD COLUMN IF NOT EXISTS font_body text NOT NULL DEFAULT 'Inter',
  ADD COLUMN IF NOT EXISTS color_palette jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS favicon_url text;

-- Ensure org-assets storage bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('org-assets', 'org-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for org-assets
CREATE POLICY "Org members can upload assets"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'org-assets');

CREATE POLICY "Anyone can view org assets"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'org-assets');

CREATE POLICY "Org members can update assets"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'org-assets');

CREATE POLICY "Org members can delete assets"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'org-assets');
