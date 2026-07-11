// Daily runtime health-check for CataloguePage and BrowseOrganizations data paths.
// Confirms org_websites_public.public_website_url is readable and that branding fields
// come back for a real org. Any missing-column / 42703 error is written to schema_validation_alerts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const dashUrl = (table: string) =>
  `https://lovable.dev/projects/0a83ebdb-a98b-48d3-aab1-d2e653ee34e4?view=more&subview=cloud&section=database&table=${encodeURIComponent(table)}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const anonClient = createClient(SUPABASE_URL, ANON);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const results: Array<Record<string, unknown>> = [];

  const report = async (obj: string, col: string | null, msg: string, severity = "critical", endpoint = "") => {
    await admin.rpc("record_schema_alert", {
      _severity: severity, _source: "health_check", _object_type: col ? "table" : "endpoint",
      _object_name: obj, _column_name: col, _message: msg,
      _details: { endpoint }, _dashboard_url: dashUrl(obj),
    });
    results.push({ obj, col, msg, severity, endpoint });
  };

  // Check 1: BrowseOrganizations data path — org_websites_public must expose branding + public_website_url
  const check1 = await anonClient
    .from("org_websites_public")
    .select("id, org_id, template_key, public_website_url, brand_primary_color, logo_url")
    .limit(3);
  if (check1.error) {
    const code = (check1.error as { code?: string }).code;
    const msg = check1.error.message;
    const m = msg.match(/column\s+"?([^\s"]+)"?\s+does not exist/i) ??
              msg.match(/column\s+([\w.]+)\s+does not exist/i);
    await report("org_websites_public", m?.[1] ?? null,
      `BrowseOrganizations select failed [${code}]: ${msg}`, "critical", "org_websites_public.select");
  } else if (!check1.data || check1.data.length === 0) {
    await report("org_websites_public", null,
      "org_websites_public returned 0 rows to anon — public catalogue page will appear empty.",
      "warning", "org_websites_public.select");
  }

  // Check 2: CataloguePage — org_catalogue_items must expose is_available
  const check2 = await anonClient
    .from("org_catalogue_items")
    .select("id, org_id, title, is_available, price, currency")
    .eq("is_available", true)
    .limit(3);
  if (check2.error) {
    const code = (check2.error as { code?: string }).code;
    const msg = check2.error.message;
    const m = msg.match(/column\s+"?([^\s"]+)"?\s+does not exist/i);
    await report("org_catalogue_items", m?.[1] ?? null,
      `CataloguePage select failed [${code}]: ${msg}`, "critical", "org_catalogue_items.select");
  }

  return new Response(
    JSON.stringify({ ok: true, checks: 2, alerts_recorded: results.length, results }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});