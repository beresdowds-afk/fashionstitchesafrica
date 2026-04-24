import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveGatewayKeys } from "../_shared/resolve-gateway-keys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLAN_NAME = "designer_monthly";
const PRICE_USD = 15;
const PLATFORM_SENTINEL_ORG = "00000000-0000-0000-0000-000000000000";

async function verifyWithGateway(gateway: string, secretKey: string, reference: string): Promise<boolean> {
  if (gateway === "paystack") {
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const data = await res.json();
    return data.data?.status === "success";
  }
  if (gateway === "stripe") {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Basic ${btoa(secretKey + ":")}` },
    });
    const data = await res.json();
    return data.payment_status === "paid";
  }
  if (gateway === "flutterwave") {
    const res = await fetch(`https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const data = await res.json();
    return data.data?.status === "successful";
  }
  return false;
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

    const { reference, gateway: gatewayHint } = await req.json();
    if (!reference) {
      return new Response(JSON.stringify({ error: "Missing reference" }), { status: 400, headers: corsHeaders });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: sub } = await serviceClient
      .from("customer_subscriptions")
      .select("*")
      .eq("user_id", userId)
      .eq("plan_name", PLAN_NAME)
      .maybeSingle();

    if (!sub) {
      return new Response(JSON.stringify({ error: "Subscription record not found" }), { status: 404, headers: corsHeaders });
    }

    if (sub.status === "active") {
      return new Response(JSON.stringify({ status: "already_paid" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gateway = gatewayHint || "paystack";
    const keys = await resolveGatewayKeys(serviceClient, PLATFORM_SENTINEL_ORG, gateway);
    if (!keys) {
      return new Response(JSON.stringify({ error: `${gateway} keys not configured` }), { status: 400, headers: corsHeaders });
    }

    const verified = await verifyWithGateway(gateway, keys.secretKey, reference);
    if (!verified) {
      return new Response(JSON.stringify({ status: "pending" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    await serviceClient.from("customer_subscriptions").update({
      status: "active",
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
    }).eq("id", sub.id);

    await serviceClient.from("platform_fee_ledger").insert({
      org_id: null,
      fee_type: "designer_subscription",
      amount: PRICE_USD,
      currency: "USD",
      status: "collected",
    });

    await serviceClient.from("audit_logs").insert({
      user_id: userId,
      action: "designer_subscription_activated",
      entity_type: "subscription",
      entity_id: sub.id,
      new_data: { plan: PLAN_NAME, amount: PRICE_USD, currency: "USD", gateway, reference },
    });

    return new Response(JSON.stringify({ status: "success", plan: PLAN_NAME }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});