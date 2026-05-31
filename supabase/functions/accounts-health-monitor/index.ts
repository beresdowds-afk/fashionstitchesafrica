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

  const reports: any[] = [];

  // 1. Verified organizations (business_reg_verified = true)
  const { data: orgs } = await svc.from("organizations")
    .select("id,name,is_active,business_reg_verified")
    .eq("business_reg_verified", true).limit(2000);
  for (const o of orgs ?? []) {
    const issues: string[] = [];
    const { count: memberCount } = await svc.from("org_members")
      .select("*", { count: "exact", head: true })
      .eq("org_id", o.id).eq("is_active", true).in("role", ["org_admin", "manager"]);
    if (!memberCount) issues.push("No active admin/manager");
    if (!o.is_active) issues.push("Organization is inactive");
    reports.push({
      subject_type: "organization", subject_id: o.id, subject_label: o.name,
      status: issues.length === 0 ? "healthy" : (o.is_active ? "degraded" : "broken"),
      checks: { is_active: o.is_active, admin_count: memberCount ?? 0 }, issues,
    });
  }

  // 2. Verified designers (profiles.access_status = 'approved' OR 'active')
  const { data: designers } = await svc.from("profiles")
    .select("id,display_name,access_status,current_org_id")
    .in("access_status", ["approved", "active"]).limit(2000);
  for (const d of designers ?? []) {
    // designer role row?
    const { count: roleCount } = await svc.from("user_roles")
      .select("*", { count: "exact", head: true })
      .eq("user_id", d.id).eq("role", "designer");
    if (!roleCount) continue; // not a designer
    const issues: string[] = [];
    if (!d.current_org_id) issues.push("No current_org_id set");
    reports.push({
      subject_type: "designer", subject_id: d.id, subject_label: d.display_name,
      status: issues.length === 0 ? "healthy" : "degraded",
      checks: { has_role: true, current_org: !!d.current_org_id }, issues,
    });
  }

  // 3. Tailors (must have an active contract via org_members role=tailor)
  const { data: tailors } = await svc.from("org_members")
    .select("user_id,org_id,is_active").eq("role", "tailor").eq("is_active", true).limit(5000);
  for (const t of tailors ?? []) {
    const issues: string[] = [];
    const { data: profile } = await svc.from("profiles")
      .select("display_name,access_status").eq("id", t.user_id).maybeSingle();
    if (!profile) issues.push("Missing profile");
    reports.push({
      subject_type: "tailor", subject_id: t.user_id, subject_label: profile?.display_name ?? "Tailor",
      status: issues.length === 0 ? "healthy" : "degraded",
      checks: { org_id: t.org_id, profile: !!profile }, issues,
    });
  }

  // 4. Customers with completed identity verification
  const { data: customers } = await svc.from("profiles")
    .select("id,display_name")
    .not("identity_verified_at", "is", null).limit(2000);
  for (const c of customers ?? []) {
    reports.push({
      subject_type: "customer", subject_id: c.id, subject_label: c.display_name,
      status: "healthy", checks: { identity_verified: true }, issues: [],
    });
  }

  // Bulk insert
  if (reports.length > 0) {
    // chunk to avoid payload limits
    for (let i = 0; i < reports.length; i += 500) {
      await svc.from("account_health_reports").insert(reports.slice(i, i + 500));
    }
  }

  const summary = {
    total: reports.length,
    healthy: reports.filter(r => r.status === "healthy").length,
    degraded: reports.filter(r => r.status === "degraded").length,
    broken: reports.filter(r => r.status === "broken").length,
  };

  return new Response(JSON.stringify({ ok: true, summary }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});