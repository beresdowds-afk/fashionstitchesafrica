
-- Messaging billing: auto-log platform fees when messages are sent
-- Rate config: SMS Termii $0.02, SMS Twilio $0.05, WhatsApp Termii $0.03, WhatsApp Twilio $0.06, Email $0.01

CREATE TABLE IF NOT EXISTS public.messaging_rate_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL,
  provider TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'global',
  rate_per_message NUMERIC NOT NULL DEFAULT 0.01,
  currency TEXT NOT NULL DEFAULT 'USD',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(channel, provider, region)
);

ALTER TABLE public.messaging_rate_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage messaging rates"
  ON public.messaging_rate_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Authenticated users can view messaging rates"
  ON public.messaging_rate_config FOR SELECT TO authenticated
  USING (true);

-- Seed default rates
INSERT INTO public.messaging_rate_config (channel, provider, region, rate_per_message) VALUES
  ('sms', 'termii', 'africa', 0.02),
  ('sms', 'twilio', 'international', 0.05),
  ('whatsapp', 'termii', 'africa', 0.03),
  ('whatsapp', 'twilio', 'international', 0.06),
  ('email', 'resend', 'global', 0.01)
ON CONFLICT (channel, provider, region) DO NOTHING;

-- Create trigger function to auto-bill messages to platform_fee_ledger
CREATE OR REPLACE FUNCTION public.bill_outbound_message()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  msg_rate NUMERIC;
  provider_name TEXT;
  fee_type_name TEXT;
BEGIN
  -- Only bill outbound sent messages
  IF NEW.status NOT IN ('sent', 'delivered') THEN
    RETURN NEW;
  END IF;

  -- Determine provider and rate based on channel
  IF NEW.channel = 'email' THEN
    provider_name := 'resend';
    fee_type_name := 'messaging_email';
  ELSIF NEW.channel = 'sms' THEN
    fee_type_name := 'messaging_sms';
    -- Check if recipient is African number (simplified check)
    IF NEW.recipient_contact LIKE '+234%' OR NEW.recipient_contact LIKE '+254%' OR
       NEW.recipient_contact LIKE '+27%' OR NEW.recipient_contact LIKE '+233%' OR
       NEW.recipient_contact LIKE '+256%' OR NEW.recipient_contact LIKE '+255%' OR
       NEW.recipient_contact LIKE '+250%' OR NEW.recipient_contact LIKE '+251%' OR
       NEW.recipient_contact LIKE '+221%' OR NEW.recipient_contact LIKE '+225%' OR
       NEW.recipient_contact LIKE '+237%' OR NEW.recipient_contact LIKE '+20%' OR
       NEW.recipient_contact LIKE '+212%' OR NEW.recipient_contact LIKE '+213%' THEN
      provider_name := 'termii';
    ELSE
      provider_name := 'twilio';
    END IF;
  ELSIF NEW.channel = 'whatsapp' THEN
    fee_type_name := 'messaging_whatsapp';
    IF NEW.recipient_contact LIKE '+234%' OR NEW.recipient_contact LIKE '+254%' OR
       NEW.recipient_contact LIKE '+27%' OR NEW.recipient_contact LIKE '+233%' OR
       NEW.recipient_contact LIKE '+256%' OR NEW.recipient_contact LIKE '+255%' OR
       NEW.recipient_contact LIKE '+250%' OR NEW.recipient_contact LIKE '+251%' OR
       NEW.recipient_contact LIKE '+221%' OR NEW.recipient_contact LIKE '+225%' OR
       NEW.recipient_contact LIKE '+237%' OR NEW.recipient_contact LIKE '+20%' OR
       NEW.recipient_contact LIKE '+212%' OR NEW.recipient_contact LIKE '+213%' THEN
      provider_name := 'termii';
    ELSE
      provider_name := 'twilio';
    END IF;
  ELSE
    -- in_app messages are free
    RETURN NEW;
  END IF;

  -- Look up rate
  SELECT rate_per_message INTO msg_rate
  FROM public.messaging_rate_config
  WHERE channel = NEW.channel AND provider = provider_name AND is_active = true
  LIMIT 1;

  IF msg_rate IS NULL OR msg_rate = 0 THEN
    msg_rate := 0.01; -- fallback
  END IF;

  -- Insert into platform_fee_ledger
  INSERT INTO public.platform_fee_ledger (org_id, fee_type, amount, currency, status, order_id)
  VALUES (NEW.org_id, fee_type_name, msg_rate, 'USD', 'charged', NEW.order_id);

  RETURN NEW;
END;
$$;

-- Attach trigger to message_logs table
DROP TRIGGER IF EXISTS trg_bill_outbound_message ON public.message_logs;
CREATE TRIGGER trg_bill_outbound_message
  AFTER INSERT ON public.message_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.bill_outbound_message();
