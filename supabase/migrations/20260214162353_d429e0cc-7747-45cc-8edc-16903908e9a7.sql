
-- Role enum
CREATE TYPE public.app_role AS ENUM ('super_admin', 'org_admin', 'tailor', 'customer');

-- Organizations table
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  description TEXT,
  country TEXT DEFAULT 'NG',
  currency TEXT DEFAULT 'NGN',
  phone TEXT,
  email TEXT,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Organization members (join table)
CREATE TABLE public.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'customer',
  is_active BOOLEAN NOT NULL DEFAULT true,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

-- User roles table (global roles like super_admin)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Add org_id to profiles for current active org context
ALTER TABLE public.profiles ADD COLUMN current_org_id UUID REFERENCES public.organizations(id);

-- ========== SECURITY DEFINER FUNCTIONS ==========

-- Check if user has a global role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Check if user is member of an org
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = _user_id AND org_id = _org_id AND is_active = true
  )
$$;

-- Check if user is org_admin of an org
CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = _user_id AND org_id = _org_id AND role = 'org_admin' AND is_active = true
  )
$$;

-- Get user's org role
CREATE OR REPLACE FUNCTION public.get_org_role(_user_id UUID, _org_id UUID)
RETURNS app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.org_members
  WHERE user_id = _user_id AND org_id = _org_id AND is_active = true
  LIMIT 1
$$;

-- ========== RLS POLICIES ==========

-- Organizations: members can view their orgs, super_admins see all
CREATE POLICY "Members can view their organizations"
  ON public.organizations FOR SELECT TO authenticated
  USING (
    public.is_org_member(auth.uid(), id)
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Org admins can update their organization"
  ON public.organizations FOR UPDATE TO authenticated
  USING (
    public.is_org_admin(auth.uid(), id)
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Authenticated users can create organizations"
  ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (true);

-- Org members: members see co-members, admins manage
CREATE POLICY "Members can view org members"
  ON public.org_members FOR SELECT TO authenticated
  USING (
    public.is_org_member(auth.uid(), org_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Org admins can add members"
  ON public.org_members FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin(auth.uid(), org_id)
    OR public.has_role(auth.uid(), 'super_admin')
    OR user_id = auth.uid() -- allow self-join when creating org
  );

CREATE POLICY "Org admins can update members"
  ON public.org_members FOR UPDATE TO authenticated
  USING (
    public.is_org_admin(auth.uid(), org_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Org admins can remove members"
  ON public.org_members FOR DELETE TO authenticated
  USING (
    public.is_org_admin(auth.uid(), org_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- User roles: only super_admins can manage, users can view own
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can manage roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Updated_at triggers
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Update profiles policy to allow reading for org members
CREATE POLICY "Org members can view co-member profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om1
      JOIN public.org_members om2 ON om1.org_id = om2.org_id
      WHERE om1.user_id = auth.uid() AND om2.user_id = profiles.id
      AND om1.is_active = true AND om2.is_active = true
    )
    OR public.has_role(auth.uid(), 'super_admin')
  );
