-- Add poster fallback column for hero video background
ALTER TABLE public.org_websites
  ADD COLUMN IF NOT EXISTS hero_poster_url text;

-- Server-side validation for hero media uploads: max 10 MB and only image/video
-- Applied via BEFORE INSERT/UPDATE trigger on storage.objects, scoped to hero paths only.
CREATE OR REPLACE FUNCTION public.validate_hero_media_upload()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  _size bigint;
  _mime text;
BEGIN
  -- Only enforce for hero-images / hero-videos / hero-posters folders
  IF NEW.name IS NULL OR NEW.name !~ '^hero-(images|videos|posters|media)/' THEN
    RETURN NEW;
  END IF;

  _size := COALESCE( (NEW.metadata->>'size')::bigint, 0 );
  _mime := lower( COALESCE( NEW.metadata->>'mimetype', '' ) );

  IF _size > 10 * 1024 * 1024 THEN
    RAISE EXCEPTION 'Hero media exceeds 10 MB limit (got % bytes)', _size
      USING ERRCODE = 'check_violation';
  END IF;

  IF _mime <> '' AND NOT (_mime LIKE 'image/%' OR _mime LIKE 'video/%') THEN
    RAISE EXCEPTION 'Hero media must be an image or video (got %)', _mime
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_hero_media_upload_trigger ON storage.objects;
CREATE TRIGGER validate_hero_media_upload_trigger
  BEFORE INSERT OR UPDATE ON storage.objects
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_hero_media_upload();