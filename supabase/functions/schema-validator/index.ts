// Daily schema validator: verifies expected columns, RLS, and GRANTs against live DB.
// Records mismatches into public.schema_validation_alerts via record_schema_alert().

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import manifest from "./expected-schema.json" with { type: "json" };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PROJECT_REF = SUPABASE_URL.split("//")[1]?.split(".")[0] ?? "";

const dashUrl = (table: string) =>
  `https://lovable.dev/projects/0a83ebdb-a98b-48d3-aab1-d2e653ee34e4?view=more&subview=cloud&section=database&table=${encodeURIComponent(table)}`;

interface ObjSpec {
  type: "table" | "view";
  name: string;
  columns: string[];
  rls_enabled?: boolean;
  grants?: Record<string, string[]>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const findings: Array<Record<string, unknown>> = [];

  const recordAlert = async (payload: {
    severity: string; object_type: string; object_name: string;
    column_name?: string | null; message: string; details?: Record<string, unknown>;
  }) => {
    const { error } = await supabase.rpc("record_schema_alert", {
      _severity: payload.severity,
      _source: "validator",
      _object_type: payload.object_type,
      _object_name: payload.object_name,
      _column_name: payload.column_name ?? null,
      _message: payload.message,
      _details: payload.details ?? {},
      _dashboard_url: dashUrl(payload.object_name),
    });
    if (error) console.error("record_schema_alert failed", error);
    findings.push(payload);
  };

  // Pull all columns / grants / RLS state for our watched objects in one round trip via information_schema
  const objects = (manifest as { objects: ObjSpec[] }).objects;
  const names = objects.map((o) => o.name);

  // Columns
  const { data: cols, error: colsErr } = await supabase
    .schema("information_schema" as never)
    .from("columns" as never)
    .select("table_name, column_name")
    .eq("table_schema", "public")
    .in("table_name", names);
  if (colsErr) console.error("cols query failed", colsErr);

  const colMap = new Map<string, Set<string>>();
  for (const row of (cols ?? []) as Array<{ table_name: string; column_name: string }>) {
    if (!colMap.has(row.table_name)) colMap.set(row.table_name, new Set());
    colMap.get(row.table_name)!.add(row.column_name);
  }

  // Grants
  const { data: grants } = await supabase
    .schema("information_schema" as never)
    .from("role_table_grants" as never)
    .select("table_name, grantee, privilege_type")
    .eq("table_schema", "public")
    .in("table_name", names);
  const grantMap = new Map<string, Map<string, Set<string>>>();
  for (const g of (grants ?? []) as Array<{ table_name: string; grantee: string; privilege_type: string }>) {
    if (!grantMap.has(g.table_name)) grantMap.set(g.table_name, new Map());
    const inner = grantMap.get(g.table_name)!;
    if (!inner.has(g.grantee)) inner.set(g.grantee, new Set());
    inner.get(g.grantee)!.add(g.privilege_type);
  }

  // RLS state via pg_tables view (readable through information_schema fallback)
  const { data: rlsRows } = await supabase
    .schema("pg_catalog" as never)
    .from("pg_tables" as never)
    .select("tablename, rowsecurity")
    .eq("schemaname", "public")
    .in("tablename", names);
  const rlsMap = new Map<string, boolean>();
  for (const r of ((rlsRows ?? []) as Array<{ tablename: string; rowsecurity: boolean }>)) {
    rlsMap.set(r.tablename, r.rowsecurity);
  }

  for (const spec of objects) {
    const presentCols = colMap.get(spec.name);
    if (!presentCols || presentCols.size === 0) {
      await recordAlert({
        severity: "critical", object_type: spec.type, object_name: spec.name,
        message: `Expected ${spec.type} public.${spec.name} not found in information_schema.`,
      });
      continue;
    }
    for (const col of spec.columns) {
      if (!presentCols.has(col)) {
        await recordAlert({
          severity: "critical", object_type: spec.type, object_name: spec.name, column_name: col,
          message: `Column ${col} missing on ${spec.type} public.${spec.name}. Client selects it — queries will fail with 42703.`,
        });
      }
    }
    if (spec.grants) {
      const actual = grantMap.get(spec.name) ?? new Map();
      for (const [role, privs] of Object.entries(spec.grants)) {
        const actualPrivs = actual.get(role) ?? new Set();
        const missing = privs.filter((p) => !actualPrivs.has(p));
        if (missing.length) {
          await recordAlert({
            severity: "warning", object_type: "grant", object_name: spec.name,
            message: `Missing GRANT ${missing.join(", ")} to ${role} on public.${spec.name}.`,
            details: { role, missing },
          });
        }
      }
    }
    if (spec.type === "table" && spec.rls_enabled && rlsMap.has(spec.name) && !rlsMap.get(spec.name)) {
      await recordAlert({
        severity: "critical", object_type: "rls", object_name: spec.name,
        message: `RLS not enabled on public.${spec.name} but manifest requires it.`,
      });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, checked: objects.length, findings_recorded: findings.length, findings, project_ref: PROJECT_REF }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});