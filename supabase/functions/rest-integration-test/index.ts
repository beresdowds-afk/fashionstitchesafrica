import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const REDACT_HEADER_PATTERNS = [/authorization/i, /cookie/i, /token/i, /secret/i, /api[-_]?key/i, /signature/i];

function redactHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((value, key) => {
    if (REDACT_HEADER_PATTERNS.some((re) => re.test(key))) out[key] = "[REDACTED]";
    else out[key] = value;
  });
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing JWT" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRows } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const roles = (roleRows ?? []).map((r: any) => r.role);
    if (!roles.includes("super_admin") && !roles.includes("super_assistant")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const integration_id: string | undefined = body.integration_id;
    const endpoint_id: string | undefined = body.endpoint_id;
    const adhocMethod: string | undefined = body.method;
    const adhocPath: string | undefined = body.path;
    const requestBody = body.body;
    const extraHeaders: Record<string, string> = body.headers ?? {};
    const extraQuery: Record<string, string> = body.query ?? {};

    if (!integration_id) {
      return new Response(JSON.stringify({ error: "integration_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: integ, error: integErr } = await admin.from("rest_api_integrations").select("*").eq("id", integration_id).maybeSingle();
    if (integErr || !integ) {
      return new Response(JSON.stringify({ error: "Integration not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!integ.is_active) {
      return new Response(JSON.stringify({ error: "Integration disabled" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let method = (adhocMethod ?? "GET").toUpperCase();
    let path = adhocPath ?? "";
    if (endpoint_id) {
      const { data: ep } = await admin.from("rest_api_endpoints").select("*").eq("id", endpoint_id).eq("integration_id", integration_id).maybeSingle();
      if (!ep) {
        return new Response(JSON.stringify({ error: "Endpoint not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      method = ep.method;
      path = ep.path;
    }

    const url = new URL(path || "/", integ.base_url);
    const mergedQuery = { ...(integ.default_query_params ?? {}), ...extraQuery };
    for (const [k, v] of Object.entries(mergedQuery)) url.searchParams.set(k, String(v));

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(integ.default_headers ?? {}),
      ...extraHeaders,
    };

    // Auth wiring — we never expose secrets to the client.
    if (integ.auth_type !== "none") {
      // For v1: we only inject a placeholder note — actual secret resolution
      // happens via linked credential references. Tests can configure default_headers
      // with a placeholder like {"Authorization":"Bearer __FROM_SERVER__"}.
      // Real secret resolution will be added when each credential source is wired in.
    }

    const started = performance.now();
    let upstream: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), integ.timeout_ms);
      upstream = await fetch(url.toString(), {
        method,
        headers,
        body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(requestBody ?? {}),
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch (e) {
      const elapsed = Math.round(performance.now() - started);
      await admin.from("audit_logs").insert({
        user_id: user.id, action: "rest_integration_test_failed", entity_type: "rest_api_integration",
        entity_id: integration_id, metadata: { error: String(e), elapsed_ms: elapsed, method, path },
      });
      return new Response(JSON.stringify({ error: "Upstream error", message: String(e), elapsed_ms: elapsed }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const elapsed = Math.round(performance.now() - started);
    const text = await upstream.text();
    const preview = text.length > 4000 ? text.slice(0, 4000) + "…[truncated]" : text;

    await admin.from("audit_logs").insert({
      user_id: user.id, action: "rest_integration_tested", entity_type: "rest_api_integration",
      entity_id: integration_id,
      metadata: { method, path, status: upstream.status, elapsed_ms: elapsed, endpoint_id: endpoint_id ?? null },
    });

    return new Response(JSON.stringify({
      status: upstream.status,
      ok: upstream.ok,
      elapsed_ms: elapsed,
      headers: redactHeaders(upstream.headers),
      body_preview: preview,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});