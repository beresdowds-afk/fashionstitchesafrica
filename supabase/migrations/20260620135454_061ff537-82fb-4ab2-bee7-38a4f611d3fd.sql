
ALTER TABLE public.org_websites
  ADD COLUMN IF NOT EXISTS featured_showcase_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_showcase_variant TEXT NOT NULL DEFAULT 'infinite-scroll'
    CHECK (featured_showcase_variant IN ('infinite-scroll','popup','fade','fly')),
  ADD COLUMN IF NOT EXISTS featured_showcase_speed TEXT NOT NULL DEFAULT 'medium'
    CHECK (featured_showcase_speed IN ('slow','medium','fast'));
