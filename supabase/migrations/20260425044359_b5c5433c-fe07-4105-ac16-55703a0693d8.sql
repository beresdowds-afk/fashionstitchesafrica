
CREATE TABLE IF NOT EXISTS public.platform_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  title text NOT NULL,
  notes text,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','minor','major','critical')),
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','admin','customer','org')),
  force_reload boolean NOT NULL DEFAULT false,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_updates_published_at
  ON public.platform_updates (published_at DESC);

ALTER TABLE public.platform_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view platform updates" ON public.platform_updates;
CREATE POLICY "Anyone can view platform updates"
  ON public.platform_updates
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Super admins can insert platform updates" ON public.platform_updates;
CREATE POLICY "Super admins can insert platform updates"
  ON public.platform_updates
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Super admins can update platform updates" ON public.platform_updates;
CREATE POLICY "Super admins can update platform updates"
  ON public.platform_updates
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

DROP POLICY IF EXISTS "Super admins can delete platform updates" ON public.platform_updates;
CREATE POLICY "Super admins can delete platform updates"
  ON public.platform_updates
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

ALTER TABLE public.platform_updates REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'platform_updates'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_updates';
  END IF;
END $$;
