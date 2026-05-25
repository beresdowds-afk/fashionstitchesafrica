-- Internal helper: log an admin access violation, then we re-raise.
-- Locked down so only other SECURITY DEFINER functions can call it.
CREATE OR REPLACE FUNCTION public.log_admin_access_violation(_function_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  INSERT INTO public.audit_logs (user_id, action, entity_type, metadata)
  VALUES (
    _uid,
    'admin_access_violation',
    'security_definer',
    jsonb_build_object(
      'function', _function_name,
      'attempted_at', now()
    )
  );
EXCEPTION WHEN OTHERS THEN
  -- never let logging fail the guard
  NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.log_admin_access_violation(text) FROM PUBLIC, anon, authenticated;

-- Update each admin-only function to log before raising.

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'super_admin') THEN
    PERFORM public.log_admin_access_violation('read_email_batch');
    RAISE EXCEPTION 'super_admin role required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'super_admin') THEN
    PERFORM public.log_admin_access_violation('delete_email');
    RAISE EXCEPTION 'super_admin role required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'super_admin') THEN
    PERFORM public.log_admin_access_violation('enqueue_email');
    RAISE EXCEPTION 'super_admin role required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE new_id BIGINT;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'super_admin') THEN
    PERFORM public.log_admin_access_violation('move_to_dlq');
    RAISE EXCEPTION 'super_admin role required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN PERFORM pgmq.create(dlq_name); EXCEPTION WHEN OTHERS THEN NULL; END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN PERFORM pgmq.delete(source_queue, message_id); EXCEPTION WHEN undefined_table THEN NULL; END;
  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_sentinel_storage_objects(_limit integer DEFAULT 500)
RETURNS TABLE(deleted_id uuid, entitlement_id uuid, storage_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'super_admin') THEN
    PERFORM public.log_admin_access_violation('cleanup_expired_sentinel_storage_objects');
    RAISE EXCEPTION 'super_admin role required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
  WITH expired AS (
    SELECT o.id, o.entitlement_id, o.storage_path
      FROM public.sentinel_storage_objects o
      JOIN public.sentinel_storage_entitlements e ON e.id = o.entitlement_id
     WHERE o.expires_at IS NOT NULL AND o.expires_at <= now()
       AND e.auto_cleanup_enabled = true AND e.status = 'active'
     LIMIT _limit
  ),
  del AS (
    DELETE FROM public.sentinel_storage_objects o
     USING expired x WHERE o.id = x.id
     RETURNING o.id AS deleted_id, o.entitlement_id, o.storage_path
  )
  SELECT * FROM del;
END;
$function$;

-- admin_set_verification_status: also log violations
CREATE OR REPLACE FUNCTION public.admin_set_verification_status(_target_type text, _target_id uuid, _decision text, _notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean;
  _old jsonb; _new jsonb; _user_id uuid; _name text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;

  _is_admin := public.has_role(_uid, 'super_admin') OR public.has_role(_uid, 'super_assistant');
  IF NOT _is_admin THEN
    PERFORM public.log_admin_access_violation('admin_set_verification_status');
    RAISE EXCEPTION 'Only super admins may set verification status' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _decision NOT IN ('approved','rejected','info_requested','pending') THEN
    RAISE EXCEPTION 'Invalid decision %', _decision;
  END IF;
  IF _decision IN ('rejected','info_requested') AND (_notes IS NULL OR length(trim(_notes)) = 0) THEN
    RAISE EXCEPTION 'Notes are required when rejecting or requesting more info';
  END IF;

  IF _target_type = 'organization' THEN
    SELECT to_jsonb(o.*) INTO _old FROM public.organizations o WHERE id = _target_id;
    IF _old IS NULL THEN RAISE EXCEPTION 'Organization not found'; END IF;
    UPDATE public.organizations SET
      business_reg_verification_status = _decision,
      business_reg_verified = (_decision = 'approved'),
      business_reg_verified_at = CASE WHEN _decision = 'approved' THEN now() ELSE business_reg_verified_at END,
      verification_notes = COALESCE(_notes, verification_notes),
      verification_reviewed_by = _uid, verification_reviewed_at = now()
    WHERE id = _target_id RETURNING to_jsonb(organizations.*), name INTO _new, _name;

    INSERT INTO public.notifications (org_id, user_id, title, message)
    SELECT _target_id, m.user_id,
           CASE _decision
             WHEN 'approved' THEN 'Business verification approved'
             WHEN 'rejected' THEN 'Business verification rejected'
             WHEN 'info_requested' THEN 'More information requested'
             ELSE 'Verification status updated' END,
           COALESCE(_notes,
             CASE _decision
               WHEN 'approved' THEN 'Your business registration has been approved. Dashboard access is now unlocked.'
               ELSE 'Your business verification status has been updated.' END)
    FROM public.org_members m
    WHERE m.org_id = _target_id AND m.role IN ('org_admin','manager') AND m.is_active = true;

  ELSIF _target_type = 'designer' THEN
    SELECT to_jsonb(p.*), id, display_name INTO _old, _user_id, _name FROM public.profiles p WHERE id = _target_id;
    IF _old IS NULL THEN RAISE EXCEPTION 'Designer profile not found'; END IF;
    UPDATE public.profiles SET
      access_status = _decision,
      access_status_notes = COALESCE(_notes, access_status_notes),
      access_status_reviewed_by = _uid, access_status_reviewed_at = now()
    WHERE id = _target_id RETURNING to_jsonb(profiles.*) INTO _new;

    INSERT INTO public.notifications (user_id, title, message)
    VALUES (_target_id,
      CASE _decision
        WHEN 'approved' THEN 'Designer access approved'
        WHEN 'rejected' THEN 'Designer access rejected'
        WHEN 'info_requested' THEN 'More information requested'
        ELSE 'Access status updated' END,
      COALESCE(_notes,
        CASE _decision
          WHEN 'approved' THEN 'Your designer account is approved. Portal access is now unlocked.'
          ELSE 'Your access status has been updated.' END));
  ELSE
    RAISE EXCEPTION 'Invalid target type %', _target_type;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_data, new_data, metadata)
  VALUES (_uid, 'verification_decision', _target_type, _target_id, _old, _new,
          jsonb_build_object('decision', _decision, 'notes', _notes));

  RETURN jsonb_build_object('ok', true, 'decision', _decision, 'target_type', _target_type, 'target_id', _target_id);
END;
$function$;