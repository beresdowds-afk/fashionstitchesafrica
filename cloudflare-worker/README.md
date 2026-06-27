# FYSORA Tenant Rewriter — Cloudflare Worker

Edge-level URL rewriter that lets every tenant custom domain
(e.g. `gabulkfashionstudio.org.ng`) serve the platform's
`/site/:slug` page while keeping the tenant URL visible in the
browser address bar.

## One-time deploy

```bash
cd cloudflare-worker
npx wrangler login                       # interactive

# 1. Create the KV namespace that holds host → slug mappings.
npx wrangler kv:namespace create TENANT_MAP
# Paste the printed `id` into wrangler.toml under [[kv_namespaces]] (binding "TENANT_MAP").

# 2. Deploy.
npx wrangler deploy --var PLATFORM_ORIGIN:https://www.fs-africa.org.ng
```

After the first deploy, also save the KV namespace id as the edge-function
secret `CLOUDFLARE_TENANT_KV_NAMESPACE_ID` so the
`cloudflare-worker-routes` function can write to it via the Cloudflare API.

## Adding a new tenant

No redeploy required — adding a tenant is fully tool-driven:

1. From Super Admin → Custom Hostnames, click **Provision Worker Route**
   on the new hostname. The `cloudflare-worker-routes` edge function:
   - registers the route `<hostname>/*` against this Worker, and
   - writes the host → slug mapping (plus the `www.` variant) into the
     `TENANT_MAP` KV namespace via the Cloudflare API.
2. The rewriter reads from KV with a 60 s per-isolate cache, so the new
   tenant resolves within a minute of provisioning.
3. Make sure the hostname is also added as a Cloudflare custom hostname
   (handled by the existing `cloudflare-hostname` flow).

To manage mappings directly, call the edge function with:
`set_tenant_mapping`, `delete_tenant_mapping`, or `list_tenant_mappings`.

## Env vars

- `PLATFORM_ORIGIN` — platform origin to forward to. Defaults to
  `https://www.fs-africa.org.ng`.
- `TENANT_MAP` — KV namespace binding (declared in `wrangler.toml`).

## Notes

- Static asset paths (`/assets/*`, files with extensions) and API /
  functions paths bypass the rewrite and are forwarded verbatim.
- A small static fallback map remains in `src/worker.js` for the
  bootstrap tenant (`gabulkfashionstudio.org.ng`) in case the KV
  binding is ever missing.