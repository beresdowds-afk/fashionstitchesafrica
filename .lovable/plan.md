## Goal
Add a **REST API Integrations Registry** table inside the Super Admin Keys & Secrets portal that lets a super admin register, wire up, test, and manage RESTful APIs for external services and internal websites/apps — all in one place, with credentials linked from the existing keys infrastructure.

## What gets built

### 1. New database table: `rest_api_integrations`
Columns (domain fields only):
- `name` (display name, unique per scope)
- `slug` (auto-generated, kebab-case)
- `scope` — enum: `external_service` | `internal_website` | `internal_app`
- `target_label` (e.g. "FYSORA Marketing Site", "Stripe", "Org Tailor App")
- `base_url` (validated https URL)
- `auth_type` — enum: `none` | `api_key_header` | `bearer_token` | `basic_auth` | `hmac_signed` | `oauth2_client_credentials`
- `auth_header_name` (e.g. `Authorization`, `X-API-Key`)
- `linked_platform_api_key_id` → `platform_api_keys.id` (existing hashed-key store)
- `linked_external_integration_id` → `external_integrations.id` (from the auto-generator)
- `default_headers` (jsonb)
- `default_query_params` (jsonb)
- `timeout_ms`, `retry_count`, `rate_limit_per_minute`
- `health_check_path`, `health_status` (`unknown|healthy|degraded|down`), `last_health_check_at`, `last_health_response_ms`
- `environment` — `live | test | staging`
- `is_active`, `created_by`, `notes`

Plus a child table `rest_api_endpoints` for the catalogue of callable endpoints per integration:
- `integration_id` → `rest_api_integrations.id`
- `name`, `method` (GET/POST/PUT/PATCH/DELETE), `path` (relative), `description`
- `request_schema` (jsonb), `response_schema` (jsonb), `sample_payload` (jsonb)
- `requires_auth`, `is_public_facing`

Both tables: GRANTs to `authenticated` and `service_role`, RLS scoped so only `super_admin` / `super_assistant` can read/write; an `is_public_facing` endpoint view exposes safe metadata to org admins (no secrets).

### 2. Edge functions
- `rest-integration-test` — super-admin only. Takes `integration_id` + optional `endpoint_id` (or ad-hoc method/path/body), resolves credentials from `platform_api_keys`/`external_integrations` server-side, signs/authenticates the request, calls the upstream, returns `{status, response_ms, headers, body_preview}`. Plaintext keys never leave the server.
- `rest-integration-health-check` — runs the configured `health_check_path` for one or all active integrations; updates `health_status`, `last_health_check_at`, `last_health_response_ms`. Can be invoked on demand or by a cron.
- `rest-integration-proxy` — authenticated server-side proxy other edge functions/internal code can call to make outbound REST requests via a registered integration by `slug`, so business code never handles raw secrets.

### 3. Audit
Every create/edit/disable/delete/test/health-check writes to existing `audit_logs` with actor user id, action, integration id/slug, and request metadata. Secrets are never logged.

### 4. UI inside `KeysSecretsPanel`
New tab/section **"REST API Integrations"** containing:
- A searchable, filterable table (columns: name, scope, target, base URL, auth type, environment, linked credential, health, last tested, status, actions).
- "Add integration" dialog with full form, live URL validation, credential picker that lists existing `platform_api_keys`/`external_integrations` (no plaintext shown).
- Per-row drawer with two tabs:
  - **Endpoints** — CRUD for the endpoint catalogue + a "Send test request" button that calls `rest-integration-test` and renders the response with redacted headers.
  - **Activity** — recent audit + health-check events.
- Inline health-check button per row and bulk "Re-check all".
- Toggle to enable/disable an integration without deleting it.

### 5. Wiring helper for the rest of the codebase
- New TS helper `src/lib/restIntegrations.ts` with `callRestIntegration({ slug, endpoint, params, body })` that invokes `rest-integration-proxy`. This is the single way frontend/edge functions consume registered REST APIs going forward.
- Documented in the existing security/keys memory so future code reuses the registry instead of inlining base URLs and secrets.

## Technical Notes
- Single migration creates both tables, enum types, indexes (`slug`, `scope`, `environment`, `is_active`), trigger to auto-slugify, GRANTs, RLS policies, plus `update_updated_at_column` triggers.
- All edge functions: JWT validation in code, Zod-validated input, CORS headers on every response, super-admin guard via `has_role`.
- Credentials are resolved on the server by joining the linked id to the existing hashed store; plaintext keys are never returned to the browser. Test-call responses redact `authorization`, `cookie`, `set-cookie`, and any header matching `*token*`, `*key*`, `*secret*`.
- No changes required to existing `external_integrations` / `platform_api_keys` schema — the new tables reference them.

## Out of Scope
- Building an OpenAPI importer (can be added later as a follow-up — endpoint catalogue is manual for v1).
- Per-org REST registries (this is platform-level; org-level integrations stay in `org_integration_api_keys`).
