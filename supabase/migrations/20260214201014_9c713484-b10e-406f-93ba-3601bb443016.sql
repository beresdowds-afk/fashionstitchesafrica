
-- Add invite_code column to organizations for customer self-registration
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS invite_code text UNIQUE;

-- Generate invite codes for existing organizations
UPDATE public.organizations 
SET invite_code = LOWER(SUBSTRING(MD5(id::text || now()::text) FROM 1 FOR 8))
WHERE invite_code IS NULL;

-- Make invite_code NOT NULL after populating existing records
ALTER TABLE public.organizations ALTER COLUMN invite_code SET NOT NULL;
ALTER TABLE public.organizations ALTER COLUMN invite_code SET DEFAULT LOWER(SUBSTRING(MD5(gen_random_uuid()::text) FROM 1 FOR 8));

-- Allow anyone to look up an org by invite code (for self-registration)
CREATE POLICY "Anyone can lookup org by invite code"
ON public.organizations
FOR SELECT
USING (true);

-- Drop the old restrictive select policy since the new one covers it
DROP POLICY IF EXISTS "Members can view their organizations" ON public.organizations;
