import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// fee_type -> exemption_type that waives it
const FEE_TO_EXEMPTION: Record<string, string> = {
  registration: "registration",
  website_builder_lite: "website_builder",
  website_builder_pro: "website_builder_pro",
  website_builder_pro_lite: "website_builder",
  mobile_app: "mobile_app",
  custom_domain_external: "custom_domain_external",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const svc = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1. Re-assert GABULK exemptions if missing
  const { data: gabulk } = await svc.from("organizations")
    .select("id,name").ilike("name", "%GABULK FASHION STUDI%");
  let gabulkRestored = 0;
  for (const o of gabulk ?? []) {
    const exemptions = ["registration", "website_builder", "website_builder_pro",
      "mobile_app", "custom_domain_external"];
    for (const t of exemptions) {
      const { error } = await svc.from("org_fee_exemptions").upsert({
        org_id: o.id, exemption_type: t,
        reason: "Complimentary access granted by platform admin",
        granted_by: "system", is_active: true,
      }, { onConflict: "org_id,exemption_type" });
      if (!error) gabulkRestored++;
    }
  }

  // 2. Sweep fee ledger entries that should have been waived by an active exemption
  const { data: fees } = await svc.from("platform_fee_ledger")
    .select("id,fee_type,org_id,amount").in("status", ["pending", "charged"]).limit(1000);

  let waived = 0;
  for (const f of fees ?? []) {
    const exType = FEE_TO_EXEMPTION[f.fee_type];
    if (!exType || !f.org_id) continue;
    const { data: ex } = await svc.from("org_fee_exemptions")
      .select("id").eq("org_id", f.org_id).eq("exemption_type", exType)
      .eq("is_active", true).maybeSingle();
    if (ex) {
      await svc.from("platform_fee_ledger").update({
        status: "waived", settled_at: new Date().toISOString(),
      }).eq("id", f.id);
      waived++;
    }
  }

  return new Response(JSON.stringify({
    ok: true, gabulk_restored: gabulkRestored, fees_scanned: fees?.length ?? 0, waived,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});