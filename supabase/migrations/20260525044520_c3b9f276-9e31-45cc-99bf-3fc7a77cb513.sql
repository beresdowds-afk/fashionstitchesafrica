
-- =========================================================
-- Lock down SECURITY DEFINER functions
-- =========================================================

-- ---------- ADMIN-ONLY RPCs: add super_admin guard ----------

CREATE OR REPLACE FUNCTION public.cleanup_expired_sentinel_storage_objects(_limit integer DEFAULT 500)
 RETURNS TABLE(deleted_id uuid, entitlement_id uuid, storage_path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'super_admin role required' USING ERRCODE = 'insufficient_privilege';
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
 RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'super_admin') THEN
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
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'super_admin role required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'super_admin') THEN
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
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_id BIGINT;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'super_admin role required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$;

-- ---------- ADMIN-ONLY: revoke EXECUTE from anon/authenticated/PUBLIC ----------

REVOKE EXECUTE ON FUNCTION public.admin_set_verification_status(text, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_sentinel_storage_objects(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;

-- admin_set_verification_status is the one exception users actually need to invoke
-- via RPC (super admin panel). Grant back to authenticated; the in-function guard
-- enforces super_admin.
GRANT EXECUTE ON FUNCTION public.admin_set_verification_status(text, uuid, text, text) TO authenticated;

-- ---------- TRIGGER-ONLY: revoke EXECUTE entirely ----------

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.archive_message_log() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.archive_inbound_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bill_outbound_message() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bill_completed_seo_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_eastforte_super_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_eastforte_org_verification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_sentinel_shield_platform_only() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_storage_entitlement_authorization() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_sentinel_shield_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_sentinel_agent_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_tour_stale_on_platform_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_grant_exemptions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_storage_object_expiry() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_storage_subscription_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_storage_objects_expiry() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- ---------- USER-FACING HELPERS: authenticated only ----------

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_own_profile(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_own_profile(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_org_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_org_admin(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_org_role(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_org_role(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_monetization_enabled(text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_monetization_enabled(text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_promotional_grant(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_promotional_grant(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.org_has_promotional_grant(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.org_has_promotional_grant(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.assign_role(app_role) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.assign_role(app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.ensure_designer_personal_org() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ensure_designer_personal_org() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.join_organization(uuid, app_role) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.join_organization(uuid, app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_organization_with_admin(text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_organization_with_admin(text, text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.claim_promotional_grant(text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_promotional_grant(text, uuid) TO authenticated;
