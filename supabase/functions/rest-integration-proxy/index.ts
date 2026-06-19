import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing JWT" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const { slug, endpoint, params, body: requestBody } = body ?? {};
    if (!slug || typeof slug !== "string") {
      return new Response(JSON.stringify({ error: "slug is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: integ } = await admin.from("rest_api_integrations").select("*").eq("slug", slug).eq("is_active", true).maybeSingle();
    if (!integ) return new Response(JSON.stringify({ error: "Integration not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let method = "GET";
    let path = "/";
    if (endpoint) {
      const { data: ep } = await admin.from("rest_api_endpoints").select("*").eq("integration_id", integ.id).eq("name", endpoint).maybeSingle();
      if (!ep) return new Response(JSON.stringify({ error: "Endpoint not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (!ep.is_public_facing) {
        const { data: roleRows } = await admin.from("user_roles").select("role").eq("user_id", user.id);
        const roles = (roleRows ?? []).map((r: any) => r.role);
        if (!roles.includes("super_admin") && !roles.includes("super_assistant")) {
          return new Response(JSON.stringify({ error: "Endpoint not public" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
      method = ep.method;
      path = ep.path;
    }

    const url = new URL(path, integ.base_url);
    const merged = { ...(integ.default_query_params ?? {}), ...(params ?? {}) };
    for (const [k, v] of Object.entries(merged)) url.searchParams.set(k, String(v));

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(integ.default_headers ?? {}),
    };

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), integ.timeout_ms ?? 15000);
    const upstream = await fetch(url.toString(), {
      method,
      headers,
      body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(requestBody ?? {}),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const text = await upstream.text();
    return new Response(JSON.stringify({ status: upstream.status, ok: upstream.ok, body: text }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});