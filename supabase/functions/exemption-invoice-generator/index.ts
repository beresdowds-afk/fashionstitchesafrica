import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let createdOrg = 0, createdUser = 0;

  // 1. Organization exemptions missing an invoice
  const { data: orgEx } = await svc.from("org_fee_exemptions")
    .select("id,org_id,exemption_type,reason,granted_at")
    .eq("is_active", true).is("invoice_generated_at", null).limit(500);

  for (const e of orgEx ?? []) {
    const { data: org } = await svc.from("organizations")
      .select("name,currency").eq("id", e.org_id).maybeSingle();
    const currency = org?.currency || "NGN";
    const invoiceNumber = `INV-EXEMPT-${Date.now().toString(36).toUpperCase()}-${e.id.slice(0, 6)}`;

    // First org admin = user_id for the invoice
    const { data: admin } = await svc.from("org_members")
      .select("user_id").eq("org_id", e.org_id).eq("is_active", true)
      .in("role", ["org_admin", "manager"]).limit(1).maybeSingle();

    if (!admin) continue;

    const { data: inv } = await svc.from("subscription_invoices").insert({
      org_id: e.org_id, user_id: admin.user_id,
      invoice_number: invoiceNumber, invoice_type: "exemption",
      description: `Complimentary ${e.exemption_type} — ${e.reason || "Fee exemption granted"}`,
      amount: 0, currency, status: "paid", payment_method: "exemption_grant",
      waiver_reason: e.reason, paid_at: new Date().toISOString(),
      related_entity_type: "org_fee_exemption", related_entity_id: e.id,
    }).select("id").single();

    // Mark exemption as invoiced
    await svc.from("org_fee_exemptions").update({
      invoice_generated_at: new Date().toISOString(),
      invoice_id: inv?.id,
    }).eq("id", e.id);

    // Revenue ledger entry: waived ($0)
    await svc.from("platform_fee_ledger").insert({
      org_id: e.org_id, fee_type: "exemption_grant",
      amount: 0, currency, status: "waived",
      settled_at: new Date().toISOString(),
    });

    createdOrg++;
  }

  // 2. User exemptions missing an invoice
  const { data: userEx } = await svc.from("user_fee_exemptions")
    .select("id,user_id,exemption_type,reason,granted_at")
    .eq("is_active", true).is("invoice_generated_at", null).limit(500);

  for (const e of userEx ?? []) {
    const invoiceNumber = `INV-EXEMPT-U-${Date.now().toString(36).toUpperCase()}-${e.id.slice(0, 6)}`;
    const { data: inv } = await svc.from("subscription_invoices").insert({
      user_id: e.user_id,
      invoice_number: invoiceNumber, invoice_type: "exemption",
      description: `Complimentary ${e.exemption_type} — ${e.reason || "Fee exemption granted"}`,
      amount: 0, currency: "USD", status: "paid", payment_method: "exemption_grant",
      waiver_reason: e.reason, paid_at: new Date().toISOString(),
      related_entity_type: "user_fee_exemption", related_entity_id: e.id,
    }).select("id").single();

    await svc.from("user_fee_exemptions").update({
      invoice_generated_at: new Date().toISOString(),
      invoice_id: inv?.id,
    }).eq("id", e.id);

    createdUser++;
  }

  return new Response(JSON.stringify({
    ok: true, invoices_created: createdOrg + createdUser,
    org_exemptions: createdOrg, user_exemptions: createdUser,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});