import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "unauthorized" }, 401);

    // Admin gate
    const { data: isAdmin } = await userClient.rpc("has_role", { _user_id: userData.user.id, _role: "super_admin" });
    const { data: isAsst } = await userClient.rpc("has_role", { _user_id: userData.user.id, _role: "super_assistant" });
    if (!isAdmin && !isAsst) return json({ error: "forbidden" }, 403);

    const { claim_id } = await req.json().catch(() => ({}));
    if (!claim_id || typeof claim_id !== "string") return json({ error: "claim_id required" }, 400);

    const svc = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: claim, error: cErr } = await svc.from("insurance_claims")
      .select("*, policy:insurance_policies(*)").eq("id", claim_id).maybeSingle();
    if (cErr) throw cErr;
    if (!claim) return json({ error: "claim not found" }, 404);

    const { data: actions } = await svc.from("insurance_claim_actions")
      .select("*").eq("claim_id", claim_id).order("created_at", { ascending: true });

    const zip = new JSZip();
    zip.file("claim.json", JSON.stringify({ claim, actions }, null, 2));

    // notes.md
    const lines: string[] = [];
    lines.push(`# Claim ${claim.claim_number}`);
    lines.push(`- Type: ${claim.claim_type}`);
    lines.push(`- Status: ${claim.status}`);
    lines.push(`- Submitted: ${claim.created_at}`);
    lines.push(`- Amount claimed: ${claim.amount_claimed ?? "—"}`);
    lines.push(`- Amount approved: ${claim.amount_approved ?? "—"}`);
    lines.push(`- Evidence status: ${claim.evidence_status ?? "—"}`);
    lines.push("\n## Description\n");
    lines.push(claim.description ?? "(empty)");
    lines.push("\n## Activity\n");
    for (const a of actions ?? []) {
      lines.push(`- [${a.created_at}] ${a.action_type}${a.description ? ` — ${a.description}` : ""}`);
    }
    zip.file("notes.md", lines.join("\n"));

    // Bundle evidence files
    const ev = zip.folder("evidence")!;
    for (const p of claim.evidence_urls ?? []) {
      try {
        const { data: blob } = await svc.storage.from("insurance-evidence").download(p);
        if (blob) ev.file(p.split("/").pop() || "file", new Uint8Array(await blob.arrayBuffer()));
      } catch (_e) { /* skip missing */ }
    }

    // Bundle chat attachments
    const chat = zip.folder("chat")!;
    for (const a of actions ?? []) {
      const atts = Array.isArray(a.attachments) ? a.attachments : [];
      for (const att of atts) {
        if (!att?.path) continue;
        try {
          const { data: blob } = await svc.storage.from("insurance-evidence").download(att.path);
          if (blob) {
            const folder = chat.folder(a.id)!;
            folder.file(att.name || (att.path.split("/").pop() ?? "file"),
              new Uint8Array(await blob.arrayBuffer()));
          }
        } catch (_e) { /* skip */ }
      }
    }

    const buf = await zip.generateAsync({ type: "uint8array" });
    return new Response(buf, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${claim.claim_number}-evidence.zip"`,
      },
    });
  } catch (e) {
    console.error("insurance-claim-export error", e);
    return json({ error: (e as Error).message ?? "internal_error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}