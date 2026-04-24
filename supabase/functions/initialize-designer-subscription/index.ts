import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveGatewayKeys, initializeGatewayPayment } from "../_shared/resolve-gateway-keys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLAN_NAME = "designer_monthly";
const PRICE_USD = 15;
const GATEWAY_PRIORITY = ["paystack", "stripe", "flutterwave"];

function isValidCallbackUrl(url: string, origin: string): boolean {
  try {
    const p = new URL(url);
    const o = new URL(origin);
    return p.origin === o.origin;
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub;

    const { callback_url, gateway: preferredGateway } = await req.json().catch(() => ({}));
    const origin = req.headers.get("origin") || Deno.env.get("SUPABASE_URL")!;
    const defaultCb = `${origin}/designer-portal?subscription=success`;
    let safeCb = defaultCb;
    if (callback_url) {
      if (isValidCallbackUrl(callback_url, origin)) safeCb = callback_url;
      else return new Response(JSON.stringify({ error: "Invalid callback_url" }), { status: 400, headers: corsHeaders });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Already active?
    const { data: existingSub } = await serviceClient
      .from("customer_subscriptions")
      .select("status, current_period_end")
      .eq("user_id", userId)
      .eq("plan_name", PLAN_NAME)
      .maybeSingle();

    if (existingSub?.status === "active" && existingSub.current_period_end && new Date(existingSub.current_period_end) > new Date()) {
      return new Response(JSON.stringify({ error: "Subscription already active", status: "already_active" }), { status: 400, headers: corsHeaders });
    }

    // Resolve a platform-level gateway (no org context for designer subscription)
    const order = preferredGateway
      ? [preferredGateway, ...GATEWAY_PRIORITY.filter(g => g !== preferredGateway)]
      : GATEWAY_PRIORITY;

    let gateway = "";
    let keys = null as Awaited<ReturnType<typeof resolveGatewayKeys>>;
    // Use a sentinel UUID for org_id lookups; resolveGatewayKeys will skip to platform keys when no org match.
    const PLATFORM_SENTINEL_ORG = "00000000-0000-0000-0000-000000000000";
    for (const gw of order) {
      keys = await resolveGatewayKeys(serviceClient, PLATFORM_SENTINEL_ORG, gw);
      if (keys) { gateway = gw; break; }
    }
    if (!keys || !gateway) {
      return new Response(JSON.stringify({ error: "No platform payment gateway configured" }), { status: 400, headers: corsHeaders });
    }

    const reference = `DSUB-${userId.substring(0, 8)}-${Date.now().toString(36)}`;
    const { data: userData } = await serviceClient.auth.admin.getUserById(userId);
    const email = userData?.user?.email || "designer@example.com";

    const result = await initializeGatewayPayment({
      gateway,
      keys,
      amount: PRICE_USD,
      currency: "USD",
      reference,
      callbackUrl: safeCb,
      email,
      metadata: { type: "designer_subscription", user_id: userId, plan: PLAN_NAME },
      productName: "FSA Designer Subscription (Monthly)",
    });

    // Upsert pending subscription row keyed on (user_id, plan_name)
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await serviceClient.from("customer_subscriptions").upsert({
      user_id: userId,
      plan_name: PLAN_NAME,
      price_amount: PRICE_USD,
      price_currency: "USD",
      billing_cycle: "monthly",
      status: "pending",
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
    }, { onConflict: "user_id,plan_name" });

    return new Response(JSON.stringify({
      checkout_url: result.checkoutUrl,
      reference: result.reference,
      gateway,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});