CREATE OR REPLACE FUNCTION public.alert_on_webhook_delivery_failure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _fp text;
  _webhook_url text;
BEGIN
  IF NEW.status <> 'dead_letter' THEN
    RETURN NEW;
  END IF;

  SELECT url INTO _webhook_url FROM public.org_outbound_webhooks WHERE id = NEW.webhook_id;
  _fp := 'webhook_dead_letter:' || COALESCE(NEW.webhook_id::text, 'unknown') || ':' || COALESCE(NEW.event, 'unknown');

  INSERT INTO public.schema_validation_alerts (
    severity, source, object_type, object_name, message, details, fingerprint
  ) VALUES (
    'critical',
    'runtime_error',
    'endpoint',
    COALESCE(_webhook_url, NEW.webhook_id::text),
    format('Webhook delivery dead-lettered after %s attempts for event %s',
           NEW.attempt, NEW.event),
    jsonb_build_object(
      'org_id', NEW.org_id,
      'webhook_id', NEW.webhook_id,
      'event', NEW.event,
      'attempt', NEW.attempt,
      'max_attempts', NEW.max_attempts,
      'response_status', NEW.response_status,
      'error', NEW.error,
      'response_body_preview', LEFT(COALESCE(NEW.response_body, ''), 500),
      'request_id', NEW.request_id,
      'category', 'org_webhook_dispatcher'
    ),
    _fp
  )
  ON CONFLICT (fingerprint) DO UPDATE
     SET occurrence_count = public.schema_validation_alerts.occurrence_count + 1,
         last_seen_at = now(),
         resolved_at = NULL,
         resolved_by = NULL,
         details = EXCLUDED.details,
         updated_at = now();

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_org_website_redirect_failure(
  _org_id uuid,
  _reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_name text;
  _mode text;
  _enabled boolean;
  _fp text;
BEGIN
  IF _org_id IS NULL THEN RETURN; END IF;

  SELECT o.name, w.mode, w.is_enabled
    INTO _org_name, _mode, _enabled
    FROM public.organizations o
    LEFT JOIN public.org_websites w ON w.org_id = o.id
   WHERE o.id = _org_id
   LIMIT 1;

  _fp := 'website_redirect_missing:' || _org_id::text;

  INSERT INTO public.schema_validation_alerts (
    severity, source, object_type, object_name, message, details, fingerprint
  ) VALUES (
    'warning',
    'runtime_error',
    'endpoint',
    COALESCE(_org_name, _org_id::text),
    'Organisation website is set to custom_integration but no redirect URL is available for visitors.',
    jsonb_build_object(
      'org_id', _org_id,
      'org_name', _org_name,
      'mode', _mode,
      'is_enabled', _enabled,
      'reason', COALESCE(_reason, 'redirect_null'),
      'category', 'org_website_redirect'
    ),
    _fp
  )
  ON CONFLICT (fingerprint) DO UPDATE
     SET occurrence_count = public.schema_validation_alerts.occurrence_count + 1,
         last_seen_at = now(),
         resolved_at = NULL,
         resolved_by = NULL,
         updated_at = now();
END;
$$;