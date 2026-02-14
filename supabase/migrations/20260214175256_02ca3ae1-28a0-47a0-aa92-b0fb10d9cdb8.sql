
-- Create measurement profiles table
CREATE TABLE public.measurement_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  profile_name TEXT NOT NULL,
  measurements JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.measurement_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view measurement profiles"
ON public.measurement_profiles FOR SELECT
USING (is_org_member(auth.uid(), org_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Org members can create measurement profiles"
ON public.measurement_profiles FOR INSERT
WITH CHECK (is_org_member(auth.uid(), org_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Org admins can update measurement profiles"
ON public.measurement_profiles FOR UPDATE
USING (is_org_admin(auth.uid(), org_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Org admins can delete measurement profiles"
ON public.measurement_profiles FOR DELETE
USING (is_org_admin(auth.uid(), org_id) OR has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_measurement_profiles_updated_at
BEFORE UPDATE ON public.measurement_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
