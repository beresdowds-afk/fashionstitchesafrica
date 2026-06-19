
-- 1) Profiles: revoke direct column SELECT on identity fields from public roles.
REVOKE SELECT (identity_number, identity_type, identity_verification_status, identity_verified)
  ON public.profiles FROM anon, authenticated;
-- service_role retains full access; the SECURITY DEFINER functions
-- get_my_identity() and admin_list_identity_verifications() continue to work.

-- 2) org_consultations: restrict INSERT to target a real, active organization.
DROP POLICY IF EXISTS "Authenticated users can book a consultation" ON public.org_consultations;
CREATE POLICY "Authenticated users can book a consultation"
  ON public.org_consultations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = org_consultations.org_id AND o.is_active = true
    )
  );

-- 3) org_websites: revoke read access on secret columns from app roles.
REVOKE SELECT (api_key, api_secret, webhook_url) ON public.org_websites FROM anon, authenticated;

-- 4) realtime.messages: scope channel subscriptions to the caller's identity.
-- Topics must be of the form "user:<auth.uid()>", "org:<org_id>" (caller must be
-- an active member of that org), or the public "platform" channel. Any other
-- topic is denied. This blocks cross-tenant snooping over Realtime broadcasts.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fsa_realtime_scope_select" ON realtime.messages;
DROP POLICY IF EXISTS "fsa_realtime_scope_insert" ON realtime.messages;

CREATE POLICY "fsa_realtime_scope_select"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    (realtime.topic() = 'platform')
    OR (realtime.topic() = 'user:' || auth.uid()::text)
    OR (
      realtime.topic() LIKE 'org:%'
      AND public.is_org_member(
        auth.uid(),
        NULLIF(SPLIT_PART(realtime.topic(), ':', 2), '')::uuid
      )
    )
    OR (
      realtime.topic() LIKE 'org-sync-%'
      AND public.is_org_member(
        auth.uid(),
        NULLIF(SUBSTRING(realtime.topic() FROM 10), '')::uuid
      )
    )
  );

CREATE POLICY "fsa_realtime_scope_insert"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (realtime.topic() = 'platform')
    OR (realtime.topic() = 'user:' || auth.uid()::text)
    OR (
      realtime.topic() LIKE 'org:%'
      AND public.is_org_member(
        auth.uid(),
        NULLIF(SPLIT_PART(realtime.topic(), ':', 2), '')::uuid
      )
    )
    OR (
      realtime.topic() LIKE 'org-sync-%'
      AND public.is_org_member(
        auth.uid(),
        NULLIF(SUBSTRING(realtime.topic() FROM 10), '')::uuid
      )
    )
  );
