
-- User notification preferences: per-user opt-in/out for each notification type
CREATE TABLE public.user_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Event type opt-ins
  order_status_email boolean NOT NULL DEFAULT true,
  order_status_sms boolean NOT NULL DEFAULT true,
  order_status_whatsapp boolean NOT NULL DEFAULT true,
  
  payment_email boolean NOT NULL DEFAULT true,
  payment_sms boolean NOT NULL DEFAULT true,
  payment_whatsapp boolean NOT NULL DEFAULT true,
  
  due_reminder_email boolean NOT NULL DEFAULT true,
  due_reminder_sms boolean NOT NULL DEFAULT false,
  due_reminder_whatsapp boolean NOT NULL DEFAULT false,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, org_id)
);

ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own preferences"
  ON public.user_notification_preferences FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own preferences"
  ON public.user_notification_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own preferences"
  ON public.user_notification_preferences FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view org preferences"
  ON public.user_notification_preferences FOR SELECT
  USING (is_org_admin(auth.uid(), org_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_user_notification_preferences_updated_at
  BEFORE UPDATE ON public.user_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
