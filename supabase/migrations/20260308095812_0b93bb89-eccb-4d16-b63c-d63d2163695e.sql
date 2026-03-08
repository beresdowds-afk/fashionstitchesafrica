
-- Paystack Dynamic Virtual Accounts table
CREATE TABLE public.paystack_virtual_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'dedicated' CHECK (account_type IN ('dedicated', 'temporary')),
  customer_code TEXT NOT NULL,
  dva_id TEXT,
  bank_name TEXT NOT NULL,
  bank_slug TEXT,
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  is_active BOOLEAN NOT NULL DEFAULT true,
  purpose TEXT DEFAULT 'general',
  reference_id TEXT,
  reference_type TEXT,
  expected_amount NUMERIC,
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- DVA transactions (auto-reconciled via webhook)
CREATE TABLE public.paystack_dva_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  virtual_account_id UUID REFERENCES public.paystack_virtual_accounts(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  paystack_reference TEXT UNIQUE NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  purpose TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'success',
  channel TEXT,
  sender_bank TEXT,
  sender_account TEXT,
  sender_name TEXT,
  session_id TEXT,
  gateway_response TEXT,
  credited_wallet BOOLEAN NOT NULL DEFAULT false,
  credited_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.paystack_virtual_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paystack_dva_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view their own virtual accounts
CREATE POLICY "Users can view own virtual accounts"
  ON public.paystack_virtual_accounts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can view own DVA transactions
CREATE POLICY "Users can view own dva transactions"
  ON public.paystack_dva_transactions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Super admins can view all virtual accounts
CREATE POLICY "Super admins can view all virtual accounts"
  ON public.paystack_virtual_accounts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Super admins can view all DVA transactions
CREATE POLICY "Super admins can view all dva transactions"
  ON public.paystack_dva_transactions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Enable realtime for dva transactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.paystack_dva_transactions;

-- Updated_at trigger
CREATE TRIGGER update_paystack_virtual_accounts_updated_at
  BEFORE UPDATE ON public.paystack_virtual_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
