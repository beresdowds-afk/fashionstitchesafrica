
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS free_tours_used integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS promo_consent boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS promo_consent_at timestamptz;
