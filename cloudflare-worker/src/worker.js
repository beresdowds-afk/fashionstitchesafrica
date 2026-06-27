/**
 * FYSORA FASHN tenant rewriter (Cloudflare Worker)
 *
 * Receives traffic on every tenant custom hostname (e.g. gabulkfashionstudio.org.ng)
 * and rewrites it at the edge to the corresponding /site/:slug path on the
 * platform origin (https://www.fs-africa.org.ng), preserving the visible URL
 * in the user's address bar.
 *
 * Tenant → slug mapping is stored in Workers KV (binding: `TENANT_MAP`) so
 * adding a new tenant is fully tool-driven via the `cloudflare-worker-routes`
 * edge function — no Worker redeploy required. A small static fallback is kept
 * for bootstrap tenants in case the KV binding is missing.
 */

const STATIC_FALLBACK = {
  "gabulkfashionstudio.org.ng": "gabulk-fashion-studio",
  "www.gabulkfashionstudio.org.ng": "gabulk-fashion-studio",
};

// Per-isolate in-memory cache to avoid a KV round-trip on every request.
const memCache = new Map(); // host -> { slug: string|null, expires: number }
const CACHE_TTL_MS = 60_000;

async function resolveSlug(host, env) {
  const now = Date.now();
  const cached = memCache.get(host);
  if (cached && cached.expires > now) return cached.slug;

  let slug = null;
  if (env.TENANT_MAP && typeof env.TENANT_MAP.get === "function") {
    try {
      slug = await env.TENANT_MAP.get(host, { cacheTtl: 60 });
    } catch (_) {
      slug = null;
    }
  }
  if (!slug) slug = STATIC_FALLBACK[host] ?? null;

  memCache.set(host, { slug, expires: now + CACHE_TTL_MS });
  return slug;
}

export default {
  /**
   * @param {Request} request
   * @param {{ PLATFORM_ORIGIN: string }} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const slug = await resolveSlug(host, env);
    const origin = env.PLATFORM_ORIGIN || "https://www.fs-africa.org.ng";

    // Unknown host → pass through to platform root.
    if (!slug) {
      return fetch(new Request(`${origin}${url.pathname}${url.search}`, request));
    }

    // Asset / API requests pass through unchanged (no /site rewrite).
    if (
      url.pathname.startsWith("/assets/") ||
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/functions/") ||
      url.pathname.startsWith("/_lovable/") ||
      /\.[a-z0-9]{2,5}$/i.test(url.pathname)
    ) {
      return fetch(new Request(`${origin}${url.pathname}${url.search}`, request));
    }

    // Already on the right /site/:slug branch — pass through.
    if (url.pathname === `/site/${slug}` || url.pathname.startsWith(`/site/${slug}/`)) {
      return fetch(new Request(`${origin}${url.pathname}${url.search}`, request));
    }

    // Rewrite root + arbitrary tenant paths into /site/:slug/...
    const suffix = url.pathname === "/" ? "" : url.pathname;
    const target = `${origin}/site/${slug}${suffix}${url.search}`;
    return fetch(new Request(target, request));
  },
};