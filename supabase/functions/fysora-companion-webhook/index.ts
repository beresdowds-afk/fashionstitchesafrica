// Inbound webhook receiver for the FYSORA Companion PWA backend.
// Verifies HMAC-SHA256 signature against the integration's shared secret
// and logs every delivery into public.external_inbound_webhooks.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-fysora-signature, x-fysora-event",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const raw = await req.text();
  const signature = req.headers.get("x-fysora-signature") ?? "";
  const event = req.headers.get("x-fysora-event") ?? "unknown";

  const { data: integration } = await admin
    .from("external_integrations")
    .select("id, hmac_secret_name")
    .eq("kind", "companion_pwa")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const secretName = integration?.hmac_secret_name ?? "FYSORA_COMPANION_WEBHOOK_SECRET";
  const secret = Deno.env.get(secretName) ?? "";
  let valid: boolean | null = null;
  if (secret) {
    try {
      const expected = await hmacHex(secret, raw);
      valid = expected === signature.replace(/^sha256=/, "");
    } catch {
      valid = false;
    }
  }

  let payload: unknown = raw;
  try { payload = JSON.parse(raw); } catch { /* keep raw */ }

  await admin.from("external_inbound_webhooks").insert({
    integration_id: integration?.id ?? null,
    source: "fysora_companion",
    event_type: event,
    signature,
    signature_valid: valid,
    payload: payload as Record<string, unknown>,
    processed: valid === true,
    processed_at: valid === true ? new Date().toISOString() : null,
    error: valid === false ? "Invalid HMAC signature" : null,
  });

  if (valid === false) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});