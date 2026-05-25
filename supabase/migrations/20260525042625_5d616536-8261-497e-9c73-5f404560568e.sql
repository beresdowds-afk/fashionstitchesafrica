
-- Tighten realtime.messages subscription policy: restrict org-scoped topics to org members
DROP POLICY IF EXISTS "Authenticated users can subscribe to realtime" ON realtime.messages;

CREATE POLICY "Restrict realtime subscriptions to allowed topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    -- Org-scoped broadcast/presence channels: require org membership
    CASE
      WHEN realtime.topic() LIKE 'org-sync-%' THEN
        public.is_org_member(auth.uid(),
          NULLIF(substring(realtime.topic() from 'org-sync-(.+)'), '')::uuid)
      WHEN realtime.topic() LIKE 'ai-jobs-%' THEN
        public.is_org_member(auth.uid(),
          NULLIF(substring(realtime.topic() from 'ai-jobs-(.+)'), '')::uuid)
      -- Super-admin-only topics
      WHEN realtime.topic() IN ('admin-dva-transactions','webhook_event_log_stream','sentinel_agent_incidents_feed','platform-updates-worker') THEN
        public.has_role(auth.uid(), 'super_admin')
        OR public.has_role(auth.uid(), 'super_assistant')
      -- Personal DVA channel
      WHEN realtime.topic() = 'dva-transactions' THEN true
      -- Tour sync (public read-only metadata)
      WHEN realtime.topic() IN ('platform-tour-tracks-sync','tour-sync-state') THEN true
      -- Notifications / inbox: per-user, app filters by user_id at query time
      WHEN realtime.topic() IN ('notifications-realtime','inbox-realtime') THEN true
      -- Video call rooms: app uses opaque random room names; restrict to authenticated
      ELSE true
    END
  )
);

-- Revoke EXECUTE from anon on SECURITY DEFINER trigger-only functions (they run as table owner; no caller needs EXECUTE)
REVOKE EXECUTE ON FUNCTION public.archive_inbound_message() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.archive_message_log() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.auto_grant_exemptions() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.bill_completed_seo_request() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.bill_outbound_message() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_eastforte_org_verification() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_eastforte_super_admin() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_sentinel_shield_platform_only() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.enforce_storage_entitlement_authorization() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_storage_subscription_changes() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_sentinel_agent_event() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_sentinel_shield_event() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.mark_tour_stale_on_platform_update() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.refresh_storage_objects_expiry() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_storage_object_expiry() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;

-- Helper RPCs (has_role, is_org_admin, is_org_member, is_own_profile, get_org_role) take a user_id argument
-- and are safe; keep them executable but restrict to authenticated only.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_org_admin(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_own_profile(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_org_role(uuid, uuid) FROM anon, public;
