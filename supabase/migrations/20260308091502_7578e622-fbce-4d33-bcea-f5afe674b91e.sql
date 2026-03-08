
-- Platform bank accounts managed by super admin
CREATE TABLE public.platform_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name TEXT NOT NULL,
  bank_code TEXT,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  sort_code TEXT,
  bank_type TEXT NOT NULL DEFAULT 'commercial',
  provider_slug TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_primary BOOLEAN DEFAULT false,
  currency TEXT NOT NULL DEFAULT 'NGN',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.platform_bank_accounts ENABLE ROW LEVEL SECURITY;

-- Super admins can manage
CREATE POLICY "Super admins manage bank accounts"
  ON public.platform_bank_accounts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Authenticated users can read active accounts
CREATE POLICY "Authenticated users read active bank accounts"
  ON public.platform_bank_accounts FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Add verification columns to bank_transfer_payments
ALTER TABLE public.bank_transfer_payments
  ADD COLUMN IF NOT EXISTS auto_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verification_method TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES public.platform_bank_accounts(id),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Insert seed data for Nigerian banks
INSERT INTO public.platform_bank_accounts (bank_name, bank_code, account_number, account_name, provider_slug, bank_type, is_active, is_primary) VALUES
  ('Stanbic IBTC Bank', '221', '', 'Fashion Stitches Africa Ltd', 'stanbic-ibtc', 'commercial', true, true),
  ('Access Bank', '044', '', 'Fashion Stitches Africa Ltd', 'access-bank', 'commercial', true, false),
  ('Moniepoint MFB', '50515', '', 'Fashion Stitches Africa Ltd', 'moniepoint', 'fintech', true, false),
  ('OPay', '999992', '', 'Fashion Stitches Africa Ltd', 'opay', 'fintech', true, false),
  ('First Bank of Nigeria', '011', '', 'Fashion Stitches Africa Ltd', 'first-bank', 'commercial', true, false),
  ('Carbon (Pay Later)', '', '', 'Fashion Stitches Africa Ltd', 'carbon', 'bnpl', true, false);
