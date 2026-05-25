# SECURITY DEFINER Access Model

This document is the **source of truth** for which Postgres roles can call each
`SECURITY DEFINER` function in the `public` schema. Future migrations MUST keep
the rules below intact unless this document is updated in the same PR.

## Why this matters

`SECURITY DEFINER` functions run as the function owner (`postgres`), bypassing
the caller's RLS. If `EXECUTE` is granted too broadly, a regular authenticated
user can perform privileged actions. The classification below is enforced by:

1. Postgres `EXECUTE` grants (revoked from `PUBLIC`, `anon`, `authenticated`
   where applicable).
2. In-function `has_role(auth.uid(), 'super_admin')` guards for the admin RPCs
   that still need to be reachable through PostgREST.
3. `log_admin_access_violation()` writes an `audit_logs` row with
   `action = 'admin_access_violation'` whenever a non-super-admin attempts an
   admin-only RPC. Super admins can monitor this via the audit-log view.

## Bucket 1 — Admin-only RPCs (super_admin in-function guard)

`EXECUTE` is revoked from `PUBLIC`, `anon`, `authenticated`. Granted to
`postgres` (and `service_role` implicitly). One exception
(`admin_set_verification_status`) is granted to `authenticated` because users
invoke it from the Super Admin dashboard; the in-function guard enforces the
role.

| Function | EXECUTE grants | In-function guard | Violation logged |
| --- | --- | --- | --- |
| `admin_set_verification_status(text,uuid,text,text)` | `postgres`, `service_role`, `authenticated` | `super_admin` OR `super_assistant` | ✅ |
| `cleanup_expired_sentinel_storage_objects(int)` | `postgres`, `service_role` | `super_admin` | ✅ |
| `read_email_batch(text,int,int)` | `postgres`, `service_role` | `super_admin` | ✅ |
| `delete_email(text,bigint)` | `postgres`, `service_role` | `super_admin` | ✅ |
| `enqueue_email(text,jsonb)` | `postgres`, `service_role` | `super_admin` | ✅ |
| `move_to_dlq(text,text,bigint,jsonb)` | `postgres`, `service_role` | `super_admin` | ✅ |
| `log_admin_access_violation(text)` | `postgres` only (internal) | n/a — internal helper | — |

## Bucket 2 — Trigger-only functions

These run as part of a trigger (as the table owner). `EXECUTE` is revoked from
`PUBLIC`, `anon`, `authenticated` so they cannot be invoked as RPCs.

- `handle_new_user`
- `archive_message_log`, `archive_inbound_message`
- `bill_outbound_message`, `bill_completed_seo_request`
- `enforce_eastforte_super_admin`, `enforce_eastforte_org_verification`
- `enforce_sentinel_shield_platform_only`
- `enforce_storage_entitlement_authorization`
- `log_sentinel_shield_event`, `log_sentinel_agent_event`
- `mark_tour_stale_on_platform_update`
- `auto_grant_exemptions`
- `set_storage_object_expiry`
- `handle_storage_subscription_changes`, `refresh_storage_objects_expiry`
- `update_updated_at_column`

## Bucket 3 — User-facing helpers (authenticated only)

Required on every authenticated request (RLS gating, signup, org membership).
`EXECUTE` is revoked from `PUBLIC`/`anon` and granted to `authenticated`. They
never expose privileged data — they return booleans or operate on rows the
caller already owns / belongs to.

- `has_role`, `is_own_profile`, `is_org_admin`, `is_org_member`, `get_org_role`
- `is_monetization_enabled`
- `has_promotional_grant`, `org_has_promotional_grant`
- `assign_role` (blocks self-assignment of `super_admin`, `super_assistant`,
  `platform_management`)
- `ensure_designer_personal_org`
- `join_organization`, `create_organization_with_admin`
- `claim_promotional_grant`

## Roles recap

| App role | Postgres role mapping | Notes |
| --- | --- | --- |
| `super_admin` | `authenticated` + `user_roles` row | Full access. Only role accepted by admin-only guards. |
| `super_assistant` | `authenticated` + `user_roles` row | Inherits Super Admin dashboard UI access; accepted by `admin_set_verification_status` guard. |
| `platform_management` | `authenticated` + `user_roles` row | Grouping role for super admin + assistants in the UI. NOT accepted by the admin-only function guards — those still require `super_admin`. |
| `org_admin`, `manager`, `designer`, `tailor`, `customer` | `authenticated` + `user_roles` / `org_members` | Bucket 3 helpers only. |
| anon | `anon` | No SECURITY DEFINER access at all. |

## Change-control checklist

When adding or modifying a `SECURITY DEFINER` function:

1. Decide which bucket it falls into (above).
2. Issue the matching `REVOKE`/`GRANT` in the same migration.
3. If Bucket 1, add `PERFORM public.log_admin_access_violation('<fn_name>')`
   immediately before the `RAISE EXCEPTION` in the role guard.
4. Update the table above in this document.
5. Add or update an entry in `src/test/securityDefinerAccess.test.ts`.
6. Run `supabase--linter`; only the pre-existing Bucket 3 warnings about
   "Signed-In Users Can Execute SECURITY DEFINER Function" should remain.

## Monitoring

Super admins can query violations:

```sql
SELECT created_at, user_id, metadata->>'function' AS function
  FROM public.audit_logs
 WHERE action = 'admin_access_violation'
 ORDER BY created_at DESC
 LIMIT 50;
```

A spike in this query indicates either a misconfigured client or a probing
attacker — investigate the `user_id` immediately.