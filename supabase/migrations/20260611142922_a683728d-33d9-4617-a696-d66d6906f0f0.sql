
-- Platform-defined catalogue categories (managed by super_admin)
CREATE TABLE public.platform_catalogue_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  icon text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_catalogue_categories TO anon, authenticated;
GRANT ALL ON public.platform_catalogue_categories TO service_role;
ALTER TABLE public.platform_catalogue_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories readable by all" ON public.platform_catalogue_categories FOR SELECT USING (true);
CREATE POLICY "Super admin manages categories" ON public.platform_catalogue_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE TRIGGER trg_pcc_updated BEFORE UPDATE ON public.platform_catalogue_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.platform_catalogue_categories (slug, label, sort_order) VALUES
  ('suits','Suits',10),('shirts','Shirts',20),('trousers','Trousers',30),
  ('dresses','Dresses',40),('traditional','Traditional',50),('accessories','Accessories',60),
  ('outerwear','Outerwear',70),('bridal','Bridal',80),('casual','Casual',90),('general','General',100);

-- Polymorphic node types
DO $$ BEGIN
  CREATE TYPE public.catalogue_node_type AS ENUM ('image','design_set','collection','album');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Individual images (org media library)
CREATE TABLE public.org_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL,
  name text NOT NULL DEFAULT 'Untitled',
  media_url text NOT NULL,
  media_type text NOT NULL DEFAULT 'image',
  alt_text text,
  tags text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_media_assets TO authenticated;
GRANT ALL ON public.org_media_assets TO service_role;
ALTER TABLE public.org_media_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members read media" ON public.org_media_assets FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Org admins manage media" ON public.org_media_assets FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid(), org_id)) WITH CHECK (public.is_org_admin(auth.uid(), org_id));
CREATE TRIGGER trg_oma_updated BEFORE UPDATE ON public.org_media_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_oma_org ON public.org_media_assets(org_id, created_at DESC);

-- Generic group factory (design_sets, collections, albums share schema)
CREATE TABLE public.org_design_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  cover_url text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.org_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  cover_url text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.org_albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  cover_url text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_design_sets, public.org_collections, public.org_albums TO authenticated;
GRANT ALL ON public.org_design_sets, public.org_collections, public.org_albums TO service_role;
ALTER TABLE public.org_design_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_albums ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read sets" ON public.org_design_sets FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins manage sets" ON public.org_design_sets FOR ALL TO authenticated USING (public.is_org_admin(auth.uid(), org_id)) WITH CHECK (public.is_org_admin(auth.uid(), org_id));
CREATE POLICY "Members read collections" ON public.org_collections FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins manage collections" ON public.org_collections FOR ALL TO authenticated USING (public.is_org_admin(auth.uid(), org_id)) WITH CHECK (public.is_org_admin(auth.uid(), org_id));
CREATE POLICY "Members read albums" ON public.org_albums FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins manage albums" ON public.org_albums FOR ALL TO authenticated USING (public.is_org_admin(auth.uid(), org_id)) WITH CHECK (public.is_org_admin(auth.uid(), org_id));
CREATE TRIGGER trg_ods_updated BEFORE UPDATE ON public.org_design_sets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_oco_updated BEFORE UPDATE ON public.org_collections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_oal_updated BEFORE UPDATE ON public.org_albums FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Polymorphic membership: child belongs to parent
CREATE TABLE public.org_grouping_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_type public.catalogue_node_type NOT NULL,
  parent_id uuid NOT NULL,
  child_type public.catalogue_node_type NOT NULL,
  child_id uuid NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(parent_type, parent_id, child_type, child_id),
  CHECK (parent_type <> 'image'),
  CHECK (
    (parent_type = 'design_set' AND child_type = 'image') OR
    (parent_type = 'collection' AND child_type IN ('design_set','image')) OR
    (parent_type = 'album' AND child_type IN ('collection','design_set','image'))
  )
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_grouping_items TO authenticated;
GRANT ALL ON public.org_grouping_items TO service_role;
ALTER TABLE public.org_grouping_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read groupings" ON public.org_grouping_items FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));
CREATE POLICY "Admins manage groupings" ON public.org_grouping_items FOR ALL TO authenticated USING (public.is_org_admin(auth.uid(), org_id)) WITH CHECK (public.is_org_admin(auth.uid(), org_id));
CREATE INDEX idx_ogi_parent ON public.org_grouping_items(parent_type, parent_id, sort_order);
CREATE INDEX idx_ogi_child ON public.org_grouping_items(child_type, child_id);

-- Extend org_catalogue_items
ALTER TABLE public.org_catalogue_items
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.platform_catalogue_categories(id),
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS source_type public.catalogue_node_type,
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS published_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_oci_published_at ON public.org_catalogue_items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_oci_category ON public.org_catalogue_items(category_id);
