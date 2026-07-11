
-- 1. USERNAME on profiles (user-chosen, unique, case-insensitive)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_uidx
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_username_format_chk;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format_chk
  CHECK (username IS NULL OR username ~ '^[A-Za-z0-9._-]{3,30}$');

-- 2. WEBAUTHN CREDENTIALS (passkeys) — one row per enrolled device
CREATE TABLE IF NOT EXISTS public.webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,       -- base64url
  public_key TEXT NOT NULL,                  -- base64url COSE key
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[] NOT NULL DEFAULT '{}',
  device_type TEXT,                          -- 'singleDevice' | 'multiDevice'
  backed_up BOOLEAN NOT NULL DEFAULT false,
  nickname TEXT,                             -- user-chosen label (e.g. "iPhone")
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.webauthn_credentials TO authenticated;
GRANT ALL ON public.webauthn_credentials TO service_role;

ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own passkeys" ON public.webauthn_credentials;
CREATE POLICY "Users manage their own passkeys"
  ON public.webauthn_credentials
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Super admins can audit passkeys" ON public.webauthn_credentials;
CREATE POLICY "Super admins can audit passkeys"
  ON public.webauthn_credentials
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_webauthn_credentials_updated_at
  BEFORE UPDATE ON public.webauthn_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. WEBAUTHN CHALLENGES — short-lived (5 min)
CREATE TABLE IF NOT EXISTS public.webauthn_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('registration','authentication')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.webauthn_challenges TO service_role;
-- No authenticated grants: only edge functions (service_role) touch this table.

ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: service_role bypasses RLS; nobody else needs access.

CREATE INDEX IF NOT EXISTS webauthn_challenges_expires_idx
  ON public.webauthn_challenges(expires_at);
