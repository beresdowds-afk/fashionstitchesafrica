## Goal

Lock down SECURITY DEFINER functions so privileged ones are usable only by `super_admin`, while keeping the everyday helpers that the app depends on functional for normal authenticated users.

## Why not "super_admin only on every definer"

Many SECURITY DEFINER functions are called by regular users on every page load. Restricting all of them to super_admin would break: signup (`handle_new_user`), org creation/joining (`create_organization_with_admin`, `join_organization`), RLS gating (`has_role`, `is_org_member`, `is_org_admin`, `is_own_profile`, `get_org_role`), designer onboarding (`ensure_designer_personal_org`, `assign_role`), promotions (`claim_promotional_grant`), monetization gating (`is_monetization_enabled`), and billing triggers (`bill_outbound_message`, `archive_message_log`, `bill_completed_seo_request`).

So the plan classifies functions into three buckets and treats each appropriately.

## Classification

```text
ADMIN-ONLY (super_admin EXECUTE only + in-function guard)
  - admin_set_verification_status        (already guards internally)
  - cleanup_expired_sentinel_storage_objects
  - read_email_batch, delete_email, enqueue_email, move_to_dlq
  - refresh_storage_objects_expiry  (trigger; also lock EXECUTE)

TRIGGER-ONLY (revoke EXECUTE from anon/authenticated/PUBLIC; triggers still fire)
  - handle_new_user
  - archive_message_log, archive_inbound_message
  - bill_outbound_message, bill_completed_seo_request
  - enforce_eastforte_super_admin, enforce_eastforte_org_verification
  - enforce_sentinel_shield_platform_only
  - enforce_storage_entitlement_authorization
  - log_sentinel_shield_event, log_sentinel_agent_event
  - mark_tour_stale_on_platform_update
  - auto_grant_exemptions
  - set_storage_object_expiry
  - handle_storage_subscription_changes
  - update_updated_at_column

USER-FACING HELPERS (keep EXECUTE for authenticated; revoke from anon/PUBLIC)
  - has_role, is_own_profile, is_org_admin, is_org_member, get_org_role
  - is_monetization_enabled
  - has_promotional_grant, org_has_promotional_grant
  - assign_role, ensure_designer_personal_org
  - join_organization, create_organization_with_admin
  - claim_promotional_grant
```

## Implementation (single migration)

For each function above, run the appropriate combination of:

```sql
-- Admin-only
REVOKE EXECUTE ON FUNCTION public.<fn>(<args>) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.<fn>(<args>) TO postgres;
-- (super_admin is an app role stored in user_roles, not a Postgres role,
--  so access is enforced by an in-function check, not by GRANT)

-- Trigger-only
REVOKE EXECUTE ON FUNCTION public.<fn>(<args>) FROM PUBLIC, anon, authenticated;
-- triggers run as table owner and still fire normally

-- User-facing helpers
REVOKE EXECUTE ON FUNCTION public.<fn>(<args>) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.<fn>(<args>) TO authenticated;
```

For the admin-only RPCs that don't already check role, add a guard at the top of the function body:

```sql
IF NOT public.has_role(auth.uid(), 'super_admin') THEN
  RAISE EXCEPTION 'super_admin role required' USING ERRCODE = 'insufficient_privilege';
END IF;
```

This will be added to: `cleanup_expired_sentinel_storage_objects`, `read_email_batch`, `delete_email`, `enqueue_email`, `move_to_dlq`.

## Verification

After migration:
1. Run `supabase--linter` — no new warnings.
2. Smoke-test as a non-admin authenticated user: signup, RLS reads, org join, monetization toggle reads all still work.
3. Smoke-test as super_admin: pending verifications approve/reject still works; data-backup edge function still works (it calls `has_role` via service role — unaffected).

## Out of scope

- No frontend changes.
- No edge function changes (already locked down in the previous security-hardening pass).
- No RLS policy changes.
