/**
 * FYSORA FASHN tenant rewriter (Cloudflare Worker)
 *
 * Receives traffic on every tenant custom hostname (e.g. gabulkfashionstudio.org.ng)
 * and rewrites it at the edge to the corresponding /site/:slug path on the
 * platform origin (https://www.fs-africa.org.ng), preserving the visible URL
 * in the user's address bar.
 *
 * Tenant → slug mapping is embedded statically here for fast cold-starts.
 * The companion edge function `cloudflare-worker-routes` keeps the Worker's
 * *route bindings* in sync with `org_custom_hostnames`, but updating this
 * mapping for a new tenant currently requires a Worker redeploy.
 */

const TENANT_MAP = {
  "gabulkfashionstudio.org.ng": "gabulk-fashion-studio",
  "www.gabulkfashionstudio.org.ng": "gabulk-fashion-studio",
};

export default {
  /**
   * @param {Request} request
   * @param {{ PLATFORM_ORIGIN: string }} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    const slug = TENANT_MAP[host];
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