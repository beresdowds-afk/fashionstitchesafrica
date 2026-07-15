// Captures a PayPal order after buyer approval, then updates the matching
// pending payment + order. Called by the frontend on return from PayPal.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { order_id: paypalOrderId } = await req.json();
    if (!paypalOrderId) {
      return new Response(JSON.stringify({ error: "missing order_id" }), { status: 400, headers: corsHeaders });
    }

    const isProd = (Deno.env.get("PAYPAL_MODE") || "sandbox") === "live";
    const base = isProd ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
    const clientId = Deno.env.get("PAYPAL_CLIENT_ID") || "";
    const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET") || "";

    const tokenRes = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error(tokenData.error_description || "PayPal auth failed");

    const capRes = await fetch(`${base}/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
    });
    const capData = await capRes.json();
    const paypalStatus = capData.status || "";
    const captured = paypalStatus === "COMPLETED";

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: payment } = await service
      .from("payments")
      .select("id, order_id, amount")
      .eq("gateway_payment_id", paypalOrderId)
      .maybeSingle();

    if (payment) {
      await service.from("payments").update({
        status: captured ? "completed" : "failed",
        paid_at: captured ? new Date().toISOString() : null,
      }).eq("id", payment.id);

      if (captured && payment.order_id) {
        const { data: order } = await service.from("orders").select("amount_paid, customer_total, total_amount").eq("id", payment.order_id).maybeSingle();
        const newPaid = Number(order?.amount_paid || 0) + Number(payment.amount);
        const total = Number(order?.customer_total || order?.total_amount || 0);
        await service.from("orders").update({
          amount_paid: newPaid,
          payment_status: newPaid >= total ? "paid" : "partial",
        }).eq("id", payment.order_id);
      }
    }

    return new Response(JSON.stringify({ ok: captured, status: paypalStatus, payment_id: payment?.id ?? null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});