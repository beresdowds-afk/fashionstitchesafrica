import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function probe(baseUrl: string, path: string, timeoutMs: number) {
  const url = new URL(path || "/", baseUrl).toString();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = performance.now();
  try {
    const r = await fetch(url, { method: "GET", signal: ctrl.signal });
    clearTimeout(t);
    const ms = Math.round(performance.now() - started);
    return { ok: r.ok, status: r.status, ms, health: r.ok ? "healthy" : r.status >= 500 ? "down" : "degraded" as const };
  } catch {
    clearTimeout(t);
    return { ok: false, status: 0, ms: Math.round(performance.now() - started), health: "down" as const };
  }
}

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

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRows } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const roles = (roleRows ?? []).map((r: any) => r.role);
    if (!roles.includes("super_admin") && !roles.includes("super_assistant")) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const integration_id: string | undefined = body.integration_id;

    let query = admin.from("rest_api_integrations").select("*").eq("is_active", true);
    if (integration_id) query = query.eq("id", integration_id);
    const { data: integs, error } = await query;
    if (error) throw error;

    const results: any[] = [];
    for (const integ of integs ?? []) {
      const r = await probe(integ.base_url, integ.health_check_path ?? "/", integ.timeout_ms ?? 15000);
      await admin.from("rest_api_integrations").update({
        health_status: r.health,
        last_health_check_at: new Date().toISOString(),
        last_health_response_ms: r.ms,
      }).eq("id", integ.id);
      results.push({ id: integ.id, slug: integ.slug, ...r });
    }

    await admin.from("audit_logs").insert({
      user_id: user.id, action: "rest_integration_health_check", entity_type: "rest_api_integration",
      entity_id: integration_id ?? null, metadata: { checked: results.length },
    });

    return new Response(JSON.stringify({ results }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});