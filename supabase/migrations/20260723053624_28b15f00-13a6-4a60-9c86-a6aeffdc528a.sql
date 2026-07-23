
-- 1. Backfill: any org with size chart enabled but empty standards gets the full set
UPDATE public.org_websites
SET size_chart_standards = ARRAY['UK','US','EU','CN']::text[]
WHERE show_size_chart = true
  AND (size_chart_standards IS NULL OR array_length(size_chart_standards, 1) IS NULL);

-- 2. Server-side validation trigger: size_chart_standards must be a subset of {UK,US,EU,CN}
--    and cannot be empty when show_size_chart is true.
CREATE OR REPLACE FUNCTION public.validate_org_website_size_chart()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  s text;
BEGIN
  IF NEW.size_chart_standards IS NOT NULL THEN
    FOREACH s IN ARRAY NEW.size_chart_standards LOOP
      IF s NOT IN ('UK','US','EU','CN') THEN
        RAISE EXCEPTION 'Invalid size_chart_standards value: %. Allowed: UK, US, EU, CN', s
          USING ERRCODE = '22023';
      END IF;
    END LOOP;
  END IF;

  IF NEW.show_size_chart = true
     AND (NEW.size_chart_standards IS NULL
          OR array_length(NEW.size_chart_standards, 1) IS NULL) THEN
    -- Auto-fill instead of failing so the chart always renders
    NEW.size_chart_standards := ARRAY['UK','US','EU','CN']::text[];
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_org_website_size_chart ON public.org_websites;
CREATE TRIGGER trg_validate_org_website_size_chart
  BEFORE INSERT OR UPDATE ON public.org_websites
  FOR EACH ROW EXECUTE FUNCTION public.validate_org_website_size_chart();

-- 3. Runtime check: guarantee org_websites_public view exposes the size chart columns.
--    Raise a loud error at migration time if the view definition drifted.
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(c, ', ') INTO missing
  FROM (
    SELECT c FROM (VALUES ('show_size_chart'), ('size_chart_standards')) AS t(c)
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'org_websites_public'
        AND column_name = t.c
    )
  ) x;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'org_websites_public view is missing required column(s): %', missing;
  END IF;
END $$;
