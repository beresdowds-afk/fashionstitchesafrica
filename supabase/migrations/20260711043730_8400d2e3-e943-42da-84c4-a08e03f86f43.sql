
CREATE TABLE public.schema_validation_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')),
  source TEXT NOT NULL CHECK (source IN ('validator','runtime_error','health_check')),
  object_type TEXT NOT NULL CHECK (object_type IN ('table','view','function','grant','rls','endpoint')),
  object_name TEXT NOT NULL,
  column_name TEXT,
  message TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  dashboard_url TEXT,
  fingerprint TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fingerprint)
);

GRANT SELECT, UPDATE ON public.schema_validation_alerts TO authenticated;
GRANT ALL ON public.schema_validation_alerts TO service_role;

ALTER TABLE public.schema_validation_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view schema alerts"
  ON public.schema_validation_alerts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'super_assistant'));

CREATE POLICY "Super admins can resolve schema alerts"
  ON public.schema_validation_alerts FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'super_assistant'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'super_assistant'));

CREATE INDEX schema_validation_alerts_open_idx
  ON public.schema_validation_alerts (last_seen_at DESC)
  WHERE resolved_at IS NULL;

CREATE TRIGGER schema_validation_alerts_updated_at
  BEFORE UPDATE ON public.schema_validation_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Dedupe-aware alert writer (SECURITY DEFINER; safe to call from anon via RPC through the health-check function)
CREATE OR REPLACE FUNCTION public.record_schema_alert(
  _severity TEXT,
  _source TEXT,
  _object_type TEXT,
  _object_name TEXT,
  _column_name TEXT,
  _message TEXT,
  _details JSONB DEFAULT '{}'::jsonb,
  _dashboard_url TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _fp TEXT := encode(digest(
    coalesce(_source,'') || '|' || coalesce(_object_type,'') || '|' ||
    coalesce(_object_name,'') || '|' || coalesce(_column_name,'') || '|' ||
    coalesce(_message,''), 'sha256'), 'hex');
  _id UUID;
BEGIN
  INSERT INTO public.schema_validation_alerts
    (severity, source, object_type, object_name, column_name, message, details, dashboard_url, fingerprint)
  VALUES
    (_severity, _source, _object_type, _object_name, _column_name, _message, coalesce(_details,'{}'::jsonb), _dashboard_url, _fp)
  ON CONFLICT (fingerprint) DO UPDATE
    SET occurrence_count = public.schema_validation_alerts.occurrence_count + 1,
        last_seen_at = now(),
        details = EXCLUDED.details,
        resolved_at = NULL,
        resolved_by = NULL,
        severity = EXCLUDED.severity
  RETURNING id INTO _id;

  -- Notify all super admins (best-effort)
  BEGIN
    INSERT INTO public.notifications (org_id, user_id, title, message)
    SELECT '00000000-0000-0000-0000-000000000000'::uuid, ur.user_id,
           'Schema alert: ' || _object_name || COALESCE(' . ' || _column_name, ''),
           _message
      FROM public.user_roles ur
     WHERE ur.role IN ('super_admin','super_assistant')
       AND NOT EXISTS (
         SELECT 1 FROM public.notifications n
          WHERE n.user_id = ur.user_id
            AND n.title = 'Schema alert: ' || _object_name || COALESCE(' . ' || _column_name, '')
            AND n.created_at > now() - interval '6 hours'
       );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_schema_alert(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT) TO service_role, authenticated;

-- Small wrapper for client runtime-error capture (any authenticated user can report a 42703 they hit)
CREATE OR REPLACE FUNCTION public.capture_missing_column_error(
  _object_name TEXT,
  _column_name TEXT,
  _message TEXT,
  _route TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  RETURN public.record_schema_alert(
    'critical','runtime_error','table',_object_name,_column_name,
    _message,
    jsonb_build_object('route', _route, 'reporter', auth.uid()),
    NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.capture_missing_column_error(TEXT,TEXT,TEXT,TEXT) TO authenticated;
