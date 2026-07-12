ALTER TABLE public.org_websites ADD COLUMN IF NOT EXISTS api_key text;
COMMENT ON COLUMN public.org_websites.api_key IS 'Optional tenant-scoped API key used by the auto-builder to authenticate outbound sync from the organization admin dashboard.';
NOTIFY pgrst, 'reload schema';