// Opay webhook receiver. Opay POSTs JSON with { payload, sha512 } for
// each payment status update. We verify the HMAC signature using the
// merchant secret, then update the matching pending payment + order.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function hmacSha512Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const raw = await req.text();
    let body: any;
    try { body = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

    const payload = body.payload || body.data || body;
    const signature = body.sha512 || body.signature || req.headers.get("x-signature");
    const secret = Deno.env.get("OPAY_SECRET_KEY") || "";

    // Signature verification (skip if no secret configured — sandbox-friendly)
    if (secret && signature) {
      const canonical = typeof body.payload === "object"
        ? JSON.stringify(body.payload)
        : (body.payload || raw);
      const expected = await hmacSha512Hex(secret, canonical);
      if (expected !== String(signature).toLowerCase()) {
        return new Response("invalid signature", { status: 401 });
      }
    }

    const reference: string | undefined = payload.reference || payload.merchantReference || payload.orderNo;
    const status: string = String(payload.status || payload.transactionStatus || "").toUpperCase();
    if (!reference) return new Response("missing reference", { status: 400 });

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const mappedStatus =
      status === "SUCCESS" || status === "COMPLETED" || status === "SUCCESSFUL" ? "completed"
      : status === "FAILED" || status === "CLOSE" || status === "EXPIRED" ? "failed"
      : "pending";

    const { data: payment } = await service
      .from("payments")
      .select("id, order_id, amount")
      .eq("gateway_payment_id", reference)
      .maybeSingle();

    if (!payment) return new Response("payment not found", { status: 404 });

    await service.from("payments").update({
      status: mappedStatus,
      paid_at: mappedStatus === "completed" ? new Date().toISOString() : null,
    }).eq("id", payment.id);

    if (mappedStatus === "completed" && payment.order_id) {
      const { data: order } = await service.from("orders").select("amount_paid, customer_total, total_amount").eq("id", payment.order_id).maybeSingle();
      const newPaid = Number(order?.amount_paid || 0) + Number(payment.amount);
      const total = Number(order?.customer_total || order?.total_amount || 0);
      await service.from("orders").update({
        amount_paid: newPaid,
        payment_status: newPaid >= total ? "paid" : "partial",
      }).eq("id", payment.order_id);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});