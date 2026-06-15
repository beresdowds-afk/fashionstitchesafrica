import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Globe, Plus, Trash2, Save, Activity, Webhook, ServerCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

type Kind = "domain" | "external_api" | "companion_pwa" | "webhook_consumer" | "worker";

interface Integration {
  id: string;
  kind: Kind;
  name: string;
  base_url: string | null;
  description: string | null;
  is_active: boolean;
  allowed_origins: string[];
  proxy_enabled: boolean;
  hmac_secret_name: string | null;
  auth_passthrough: boolean;
  rate_limit_per_minute: number | null;
  health_status: string;
  last_health_check_at: string | null;
  metadata: Record<string, unknown>;
}

interface InboundLog {
  id: string;
  source: string;
  event_type: string;
  signature_valid: boolean | null;
  processed: boolean;
  received_at: string;
  error: string | null;
}

const KIND_LABELS: Record<Kind, string> = {
  domain: "External Domain",
  external_api: "External API",
  companion_pwa: "FYSORA Companion PWA Backend",
  webhook_consumer: "Webhook Consumer",
  worker: "Worker / Background Service",
};

const emptyDraft = {
  kind: "external_api" as Kind,
  name: "",
  base_url: "",
  description: "",
  allowed_origins: "",
  hmac_secret_name: "",
  proxy_enabled: false,
  auth_passthrough: true,
  rate_limit_per_minute: 120,
};

const ExternalIntegrationsPanel = () => {
  const [items, setItems] = useState<Integration[]>([]);
  const [logs, setLogs] = useState<InboundLog[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [pinging, setPinging] = useState<string | null>(null);

  const load = async () => {
    const [{ data: integ }, { data: logRows }] = await Promise.all([
      supabase.from("external_integrations").select("*").order("created_at", { ascending: false }),
      supabase.from("external_inbound_webhooks").select("id, source, event_type, signature_valid, processed, received_at, error").order("received_at", { ascending: false }).limit(15),
    ]);
    setItems((integ as Integration[]) ?? []);
    setLogs((logRows as InboundLog[]) ?? []);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!draft.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const origins = draft.allowed_origins.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    const { error } = await supabase.from("external_integrations").insert({
      kind: draft.kind,
      name: draft.name.trim(),
      base_url: draft.base_url.trim() || null,
      description: draft.description.trim() || null,
      allowed_origins: origins,
      proxy_enabled: draft.proxy_enabled,
      auth_passthrough: draft.auth_passthrough,
      hmac_secret_name: draft.hmac_secret_name.trim() || null,
      rate_limit_per_minute: Number(draft.rate_limit_per_minute) || 120,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
      return;
    }
    setDraft(emptyDraft);
    setShowForm(false);
    load();
    toast({ title: "Integration registered" });
  };

  const toggleActive = async (row: Integration) => {
    await supabase.from("external_integrations").update({ is_active: !row.is_active }).eq("id", row.id);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this integration?")) return;
    await supabase.from("external_integrations").delete().eq("id", id);
    load();
  };

  const ping = async (row: Integration) => {
    if (!row.base_url) return;
    setPinging(row.id);
    let status = "unhealthy";
    try {
      const res = await fetch(row.base_url, { method: "HEAD", mode: "no-cors" });
      status = res.ok || res.type === "opaque" ? "healthy" : "unhealthy";
    } catch { status = "unreachable"; }
    await supabase.from("external_integrations").update({
      health_status: status,
      last_health_check_at: new Date().toISOString(),
    }).eq("id", row.id);
    setPinging(null);
    load();
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe size={18} className="text-primary" />
            <h2 className="font-heading font-semibold text-base">External Integrations & Non-Native Domains</h2>
          </div>
          <Button size="sm" variant="hero" onClick={() => setShowForm((v) => !v)}>
            <Plus size={14} className="mr-1" /> Register
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Register external sites, APIs, and the FYSORA Companion PWA backend. Each entry can enable
          a JWT-passthrough proxy and an HMAC-verified inbound webhook.
        </p>

        {showForm && (
          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v as Kind })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
                      <SelectItem key={k} value={k}>{KIND_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Partner CRM API" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">Base URL</Label>
                <Input value={draft.base_url} onChange={(e) => setDraft({ ...draft, base_url: e.target.value })} placeholder="https://api.example.com" />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">Allowed origins (comma or space separated)</Label>
                <Input value={draft.allowed_origins} onChange={(e) => setDraft({ ...draft, allowed_origins: e.target.value })} placeholder="https://app.example.com, https://www.fs-africa.org.ng" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">HMAC secret name</Label>
                <Input value={draft.hmac_secret_name} onChange={(e) => setDraft({ ...draft, hmac_secret_name: e.target.value })} placeholder="FYSORA_COMPANION_WEBHOOK_SECRET" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Rate limit (req/min)</Label>
                <Input type="number" value={draft.rate_limit_per_minute} onChange={(e) => setDraft({ ...draft, rate_limit_per_minute: Number(e.target.value) })} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs">Description</Label>
                <Textarea rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-2">
                <Label className="text-xs">Enable proxy</Label>
                <Switch checked={draft.proxy_enabled} onCheckedChange={(v) => setDraft({ ...draft, proxy_enabled: v })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-2">
                <Label className="text-xs">Forward user JWT</Label>
                <Switch checked={draft.auth_passthrough} onCheckedChange={(v) => setDraft({ ...draft, auth_passthrough: v })} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={save} disabled={saving}><Save size={14} className="mr-1" />{saving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No integrations registered yet.</p>
          ) : items.map((row) => (
            <div key={row.id} className="rounded-lg border border-border p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <ServerCog size={14} className="text-primary shrink-0" />
                  <span className="font-medium text-sm truncate">{row.name}</span>
                  <Badge variant="outline" className="text-[10px]">{KIND_LABELS[row.kind]}</Badge>
                  <Badge variant={row.health_status === "healthy" ? "default" : "secondary"} className="text-[10px] capitalize">{row.health_status}</Badge>
                  {row.proxy_enabled && <Badge className="text-[10px]">proxy</Badge>}
                </div>
                {row.base_url && <p className="text-xs text-muted-foreground font-mono truncate">{row.base_url}</p>}
                {row.allowed_origins?.length > 0 && (
                  <p className="text-[10px] text-muted-foreground truncate">Origins: {row.allowed_origins.join(", ")}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch checked={row.is_active} onCheckedChange={() => toggleActive(row)} />
                <Button size="sm" variant="ghost" onClick={() => ping(row)} disabled={pinging === row.id || !row.base_url}>
                  <Activity size={14} />
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(row.id)}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Inbound webhook log */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Webhook size={18} className="text-primary" />
          <h2 className="font-heading font-semibold text-base">Recent Inbound Webhook Events</h2>
        </div>
        {logs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No events received yet.</p>
        ) : (
          <div className="space-y-1.5">
            {logs.map((l) => (
              <div key={l.id} className="flex items-center justify-between text-xs rounded-md border border-border px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant={l.signature_valid ? "default" : "destructive"} className="text-[10px]">
                    {l.signature_valid === null ? "unsigned" : l.signature_valid ? "valid" : "invalid"}
                  </Badge>
                  <span className="font-mono truncate">{l.source} · {l.event_type}</span>
                </div>
                <span className="text-muted-foreground shrink-0">{new Date(l.received_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default ExternalIntegrationsPanel;