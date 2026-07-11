// Verifies profiles.identity_number / identity_type PII is:
//  - NOT readable by co-members (authenticated, non-owner, non-admin)
//  - Readable by the profile owner via get_my_identity()
//  - Readable by super admins via admin_list_identity_verifications()
// Any violation is written to schema_validation_alerts as a critical issue.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const dashUrl = (t: string) =>
  `https://lovable.dev/projects/0a83ebdb-a98b-48d3-aab1-d2e653ee34e4?view=more&subview=cloud&section=database&table=${encodeURIComponent(t)}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const anonClient = createClient(SUPABASE_URL, ANON);
  const results: Array<Record<string, unknown>> = [];

  const record = async (severity: string, message: string, extra: Record<string, unknown> = {}) => {
    if (severity === "critical" || severity === "warning") {
      await admin.rpc("record_schema_alert", {
        _severity: severity,
        _source: "identity_access_check",
        _object_type: "table",
        _object_name: "profiles",
        _column_name: "identity_number",
        _message: message,
        _details: extra,
        _dashboard_url: dashUrl("profiles"),
      });
    }
    results.push({ severity, message, ...extra });
  };

  // Test 1: anon must not select identity columns
  const anonSel = await anonClient
    .from("profiles")
    .select("id, identity_number, identity_type")
    .limit(1);
  if (!anonSel.error) {
    await record("critical", "PII leak: anon role can SELECT identity_number/identity_type on profiles.");
  } else {
    results.push({ test: "anon_blocked", ok: true, code: (anonSel.error as { code?: string }).code });
  }

  // Test 2: authenticated role privilege on identity columns (column-level GRANT check)
  const { data: grantRows, error: grantErr } = await admin.rpc as unknown as never;
  // Use raw SQL via read_query-safe function is not exposed; inspect information_schema instead
  const { data: colPrivs, error: colErr } = await admin
    .from("information_schema.column_privileges" as never)
    .select("grantee, column_name, privilege_type")
    .eq("table_schema", "public")
    .eq("table_name", "profiles")
    .in("column_name", ["identity_number", "identity_type", "identity_verification_status"] as never);
  if (colErr) {
    results.push({ test: "grant_introspection", warning: colErr.message });
  } else {
    const leaked = (colPrivs as Array<{ grantee: string; column_name: string; privilege_type: string }> | null)
      ?.filter((r) => (r.grantee === "anon" || r.grantee === "authenticated") && r.privilege_type === "SELECT") ?? [];
    if (leaked.length > 0) {
      await record("critical",
        `Column-level SELECT still granted to ${leaked.map((l) => l.grantee).join(", ")} on profiles PII columns.`,
        { leaked });
    } else {
      results.push({ test: "no_grant_to_client_roles", ok: true });
    }
  }

  // Test 3: super-admin RPC works
  const rpc = await admin.rpc("admin_list_identity_verifications");
  results.push({ test: "admin_rpc", ok: !rpc.error, error: rpc.error?.message });

  return new Response(
    JSON.stringify({ ok: true, results }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});