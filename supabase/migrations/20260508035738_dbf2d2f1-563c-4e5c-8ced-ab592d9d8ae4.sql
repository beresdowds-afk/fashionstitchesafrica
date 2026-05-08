-- ============================================================
-- 1. Storage retention + auto cleanup
-- ============================================================
ALTER TABLE public.sentinel_storage_entitlements
  ADD COLUMN IF NOT EXISTS retention_days INTEGER,
  ADD COLUMN IF NOT EXISTS auto_cleanup_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_cleanup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_cleanup_deleted_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.sentinel_storage_objects
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sentinel_storage_objects_expires_at
  ON public.sentinel_storage_objects(expires_at)
  WHERE expires_at IS NOT NULL;

-- Trigger: when an object is inserted, set expires_at based on entitlement retention
CREATE OR REPLACE FUNCTION public.set_storage_object_expiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _retention INTEGER;
  _enabled BOOLEAN;
BEGIN
  IF NEW.expires_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT retention_days, auto_cleanup_enabled
    INTO _retention, _enabled
    FROM public.sentinel_storage_entitlements
   WHERE id = NEW.entitlement_id;

  IF _enabled AND _retention IS NOT NULL AND _retention > 0 THEN
    NEW.expires_at := NEW.created_at + make_interval(days => _retention);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_storage_object_expiry ON public.sentinel_storage_objects;
CREATE TRIGGER trg_set_storage_object_expiry
BEFORE INSERT ON public.sentinel_storage_objects
FOR EACH ROW EXECUTE FUNCTION public.set_storage_object_expiry();

-- When entitlement retention policy changes, refresh existing objects' expires_at
CREATE OR REPLACE FUNCTION public.refresh_storage_objects_expiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.auto_cleanup_enabled AND NEW.retention_days IS NOT NULL AND NEW.retention_days > 0 THEN
    UPDATE public.sentinel_storage_objects
       SET expires_at = created_at + make_interval(days => NEW.retention_days)
     WHERE entitlement_id = NEW.id;
  ELSIF NEW.auto_cleanup_enabled = false THEN
    UPDATE public.sentinel_storage_objects
       SET expires_at = NULL
     WHERE entitlement_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_storage_objects_expiry ON public.sentinel_storage_entitlements;
CREATE TRIGGER trg_refresh_storage_objects_expiry
AFTER UPDATE OF retention_days, auto_cleanup_enabled ON public.sentinel_storage_entitlements
FOR EACH ROW
WHEN (OLD.retention_days IS DISTINCT FROM NEW.retention_days
   OR OLD.auto_cleanup_enabled IS DISTINCT FROM NEW.auto_cleanup_enabled)
EXECUTE FUNCTION public.refresh_storage_objects_expiry();

-- Helper to be called by edge worker / cron: deletes expired DB rows and returns paths
CREATE OR REPLACE FUNCTION public.cleanup_expired_sentinel_storage_objects(_limit INTEGER DEFAULT 500)
RETURNS TABLE(deleted_id UUID, entitlement_id UUID, storage_path TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH expired AS (
    SELECT o.id, o.entitlement_id, o.storage_path
      FROM public.sentinel_storage_objects o
      JOIN public.sentinel_storage_entitlements e ON e.id = o.entitlement_id
     WHERE o.expires_at IS NOT NULL
       AND o.expires_at <= now()
       AND e.auto_cleanup_enabled = true
       AND e.status = 'active'
     LIMIT _limit
  ),
  del AS (
    DELETE FROM public.sentinel_storage_objects o
     USING expired x
     WHERE o.id = x.id
     RETURNING o.id AS deleted_id, o.entitlement_id, o.storage_path
  )
  SELECT * FROM del;
END;
$$;

-- ============================================================
-- 2. Agent activation incident timeline
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sentinel_agent_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_kind TEXT NOT NULL,                -- 'platform_agent' | 'shield'
  agent_key TEXT NOT NULL,                 -- e.g. steven_ai, rachel_crm, sentinel_shield_free
  agent_name TEXT,
  event_type TEXT NOT NULL,                -- status_change | retry | error | activated | requested
  from_status TEXT,
  to_status TEXT,
  attempt_count INTEGER,
  next_retry_at TIMESTAMPTZ,
  error_message TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sentinel_agent_incidents_agent
  ON public.sentinel_agent_incidents(agent_kind, agent_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sentinel_agent_incidents_created
  ON public.sentinel_agent_incidents(created_at DESC);

ALTER TABLE public.sentinel_agent_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage agent incidents"
  ON public.sentinel_agent_incidents
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Trigger: log every meaningful change on platform agents
CREATE OR REPLACE FUNCTION public.log_sentinel_agent_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _evt TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.sentinel_agent_incidents
      (agent_kind, agent_key, agent_name, event_type, to_status, attempt_count, next_retry_at, error_message, details)
    VALUES
      ('platform_agent', NEW.agent_key, NEW.agent_name, 'created', NEW.status, NEW.attempt_count,
       NEW.next_retry_at, NEW.last_error, jsonb_build_object('plan_key', NEW.plan_key));
    RETURN NEW;
  END IF;

  -- Determine event_type
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    _evt := CASE
      WHEN NEW.status = 'active' THEN 'activated'
      WHEN NEW.status = 'failed' THEN 'failed'
      ELSE 'status_change'
    END;
  ELSIF OLD.attempt_count IS DISTINCT FROM NEW.attempt_count THEN
    _evt := 'retry';
  ELSIF OLD.last_error IS DISTINCT FROM NEW.last_error AND NEW.last_error IS NOT NULL THEN
    _evt := 'error';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.sentinel_agent_incidents
    (agent_kind, agent_key, agent_name, event_type, from_status, to_status,
     attempt_count, next_retry_at, error_message, details)
  VALUES
    ('platform_agent', NEW.agent_key, NEW.agent_name, _evt, OLD.status, NEW.status,
     NEW.attempt_count, NEW.next_retry_at, NEW.last_error,
     jsonb_build_object(
       'last_attempt_at', NEW.last_attempt_at,
       'max_attempts', NEW.max_attempts
     ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_sentinel_agent_event ON public.sentinel_platform_agents;
CREATE TRIGGER trg_log_sentinel_agent_event
AFTER INSERT OR UPDATE ON public.sentinel_platform_agents
FOR EACH ROW EXECUTE FUNCTION public.log_sentinel_agent_event();

-- Also log SHIELD activation timeline for completeness
CREATE OR REPLACE FUNCTION public.log_sentinel_shield_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _evt TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.sentinel_agent_incidents
      (agent_kind, agent_key, agent_name, event_type, to_status, attempt_count, next_retry_at, error_message)
    VALUES
      ('shield', 'sentinel_shield_free', 'SENTINEL-SHIELD', 'created',
       NEW.status, NEW.attempt_count, NEW.next_retry_at, NEW.last_error);
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    _evt := CASE WHEN NEW.status = 'active' THEN 'activated'
                 WHEN NEW.status = 'failed' THEN 'failed'
                 ELSE 'status_change' END;
  ELSIF OLD.attempt_count IS DISTINCT FROM NEW.attempt_count THEN
    _evt := 'retry';
  ELSIF OLD.last_error IS DISTINCT FROM NEW.last_error AND NEW.last_error IS NOT NULL THEN
    _evt := 'error';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.sentinel_agent_incidents
    (agent_kind, agent_key, agent_name, event_type, from_status, to_status,
     attempt_count, next_retry_at, error_message)
  VALUES
    ('shield', 'sentinel_shield_free', 'SENTINEL-SHIELD', _evt, OLD.status, NEW.status,
     NEW.attempt_count, NEW.next_retry_at, NEW.last_error);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_sentinel_shield_event ON public.sentinel_shield_activation;
CREATE TRIGGER trg_log_sentinel_shield_event
AFTER INSERT OR UPDATE ON public.sentinel_shield_activation
FOR EACH ROW EXECUTE FUNCTION public.log_sentinel_shield_event();