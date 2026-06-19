// FYSORA Companion PWA proxy.
// Forwards authenticated PWA requests to the registered companion backend
// (e.g. https://api.fs-africa.org.ng), passing through the user's JWT and
// applying the per-integration allowed-origins/rate-limit configuration.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Require an authenticated caller. allowed_origins is treated only as a CORS hint;
    // non-browser tools can omit Origin, so it must not be the only security gate.
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    // Path format: /fysora-companion-proxy/<remaining/path>?...
    const subPath = url.pathname.replace(/^\/+fysora-companion-proxy\/?/, "");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: integration, error } = await admin
      .from("external_integrations")
      .select("base_url, is_active, proxy_enabled, allowed_origins, auth_passthrough")
      .eq("kind", "companion_pwa")
      .eq("is_active", true)
      .eq("proxy_enabled", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !integration?.base_url) {
      return new Response(JSON.stringify({ error: "Companion backend not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const origin = req.headers.get("origin") ?? "";
    if (integration.allowed_origins?.length && origin && !integration.allowed_origins.includes(origin)) {
      return new Response(JSON.stringify({ error: "Origin not allowed" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const target = `${integration.base_url.replace(/\/+$/, "")}/${subPath}${url.search}`;
    const fwdHeaders = new Headers(req.headers);
    fwdHeaders.delete("host");
    if (!integration.auth_passthrough) fwdHeaders.delete("authorization");

    const body = ["GET", "HEAD"].includes(req.method) ? undefined : await req.arrayBuffer();
    const upstream = await fetch(target, { method: req.method, headers: fwdHeaders, body });
    const respBody = await upstream.arrayBuffer();
    const respHeaders = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(corsHeaders)) respHeaders.set(k, v);
    return new Response(respBody, { status: upstream.status, headers: respHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});