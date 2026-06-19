import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Activity, Plus, Play, RefreshCw, Trash2, Globe, Server, Box } from "lucide-react";

type Scope = "external_service" | "internal_website" | "internal_app";
type Env = "live" | "test" | "staging";
type Auth = "none" | "api_key_header" | "bearer_token" | "basic_auth" | "hmac_signed" | "oauth2_client_credentials";
type Health = "unknown" | "healthy" | "degraded" | "down";

interface Integration {
  id: string;
  name: string;
  slug: string;
  scope: Scope;
  target_label: string;
  base_url: string;
  auth_type: Auth;
  environment: Env;
  is_active: boolean;
  health_status: Health;
  last_health_check_at: string | null;
  last_health_response_ms: number | null;
  health_check_path: string | null;
  timeout_ms: number;
  retry_count: number;
  rate_limit_per_minute: number;
  notes: string | null;
}

const SCOPE_OPTIONS: { value: Scope; label: string; icon: any }[] = [
  { value: "external_service", label: "External Service", icon: Globe },
  { value: "internal_website", label: "Internal Website", icon: Server },
  { value: "internal_app", label: "Internal App", icon: Box },
];

const AUTH_OPTIONS: { value: Auth; label: string }[] = [
  { value: "none", label: "None" },
  { value: "api_key_header", label: "API Key Header" },
  { value: "bearer_token", label: "Bearer Token" },
  { value: "basic_auth", label: "Basic Auth" },
  { value: "hmac_signed", label: "HMAC Signed" },
  { value: "oauth2_client_credentials", label: "OAuth2 Client Credentials" },
];

const ENV_OPTIONS: Env[] = ["live", "test", "staging"];

const healthVariant = (h: Health) =>
  h === "healthy" ? "default" : h === "degraded" ? "secondary" : h === "down" ? "destructive" : "outline";

const RestApiRegistryPanel = () => {
  const [rows, setRows] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<Scope | "all">("all");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);

  const [form, setForm] = useState({
    name: "",
    scope: "external_service" as Scope,
    target_label: "",
    base_url: "https://",
    auth_type: "none" as Auth,
    auth_header_name: "",
    environment: "live" as Env,
    health_check_path: "/",
    timeout_ms: 15000,
    retry_count: 0,
    rate_limit_per_minute: 60,
    notes: "",
  });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("rest_api_integrations" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Failed to load", description: error.message, variant: "destructive" });
    } else {
      setRows((data ?? []) as unknown as Integration[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (scopeFilter !== "all" && r.scope !== scopeFilter) return false;
      if (!q) return true;
      return [r.name, r.slug, r.target_label, r.base_url].some((v) => v?.toLowerCase().includes(q));
    });
  }, [rows, search, scopeFilter]);

  const validUrl = (() => {
    try { new URL(form.base_url); return /^https?:\/\//i.test(form.base_url); } catch { return false; }
  })();
  const validName = form.name.trim().length >= 3 && form.name.trim().length <= 80;

  const submit = async () => {
    if (!validName || !validUrl || !form.target_label.trim()) {
      toast({ title: "Please complete required fields", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      name: form.name.trim(),
      scope: form.scope,
      target_label: form.target_label.trim(),
      base_url: form.base_url.trim(),
      auth_type: form.auth_type,
      auth_header_name: form.auth_header_name.trim() || null,
      environment: form.environment,
      health_check_path: form.health_check_path.trim() || null,
      timeout_ms: form.timeout_ms,
      retry_count: form.retry_count,
      rate_limit_per_minute: form.rate_limit_per_minute,
      notes: form.notes.trim() || null,
      created_by: user?.id ?? null,
    };
    const { error } = await supabase.from("rest_api_integrations" as any).insert(payload);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Integration added" });
    setOpen(false);
    setForm({ ...form, name: "", target_label: "", base_url: "https://", notes: "" });
    load();
  };

  const toggleActive = async (row: Integration) => {
    const { error } = await supabase.from("rest_api_integrations" as any)
      .update({ is_active: !row.is_active }).eq("id", row.id);
    if (error) toast({ title: "Update failed", description: error.message, variant: "destructive" });
    else load();
  };

  const remove = async (row: Integration) => {
    if (!confirm(`Delete integration "${row.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("rest_api_integrations" as any).delete().eq("id", row.id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Deleted" }); load(); }
  };

  const runTest = async (row: Integration) => {
    setTesting(row.id);
    const { data, error } = await supabase.functions.invoke("rest-integration-test", {
      body: { integration_id: row.id },
    });
    setTesting(null);
    if (error) {
      toast({ title: "Test failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: `Test → ${data?.status ?? "?"} in ${data?.elapsed_ms ?? "?"}ms`,
      description: data?.ok ? "Upstream responded OK" : "Non-2xx response",
    });
  };

  const recheckAll = async () => {
    setProbing(true);
    const { error } = await supabase.functions.invoke("rest-integration-health-check", { body: {} });
    setProbing(false);
    if (error) toast({ title: "Health check failed", description: error.message, variant: "destructive" });
    else { toast({ title: "Health check complete" }); load(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4" /> REST API Integrations
          </h3>
          <p className="text-xs text-muted-foreground">
            Register and wire RESTful APIs for external services and internal sites/apps. Secrets resolve server-side.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={recheckAll} disabled={probing}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${probing ? "animate-spin" : ""}`} /> Re-check all
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add integration
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search name, slug, URL…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={scopeFilter} onValueChange={(v) => setScopeFilter(v as any)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All scopes</SelectItem>
            {SCOPE_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Name</th>
                <th className="text-left px-3 py-2 font-medium">Scope</th>
                <th className="text-left px-3 py-2 font-medium">Base URL</th>
                <th className="text-left px-3 py-2 font-medium">Auth</th>
                <th className="text-left px-3 py-2 font-medium">Env</th>
                <th className="text-left px-3 py-2 font-medium">Health</th>
                <th className="text-left px-3 py-2 font-medium">Active</th>
                <th className="text-right px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">No integrations yet.</td></tr>
              ) : filtered.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{r.slug}</div>
                  </td>
                  <td className="px-3 py-2 capitalize">{r.scope.replace("_", " ")}</td>
                  <td className="px-3 py-2 font-mono text-xs truncate max-w-xs">{r.base_url}</td>
                  <td className="px-3 py-2 text-xs">{r.auth_type.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2"><Badge variant="outline" className="capitalize">{r.environment}</Badge></td>
                  <td className="px-3 py-2">
                    <Badge variant={healthVariant(r.health_status) as any} className="capitalize">{r.health_status}</Badge>
                    {r.last_health_response_ms != null && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">{r.last_health_response_ms} ms</div>
                    )}
                  </td>
                  <td className="px-3 py-2"><Switch checked={r.is_active} onCheckedChange={() => toggleActive(r)} /></td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => runTest(r)} disabled={testing === r.id}>
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(r)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add REST API integration</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <Label>Display name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Stripe Payments" />
              {!validName && form.name.length > 0 && (
                <p className="text-xs text-destructive mt-1">Name must be 3–80 characters.</p>
              )}
            </div>
            <div>
              <Label>Scope *</Label>
              <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v as Scope })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCOPE_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target label *</Label>
              <Input value={form.target_label} onChange={(e) => setForm({ ...form, target_label: e.target.value })} placeholder="e.g. Stripe / FYSORA Marketing Site" />
            </div>
            <div className="md:col-span-2">
              <Label>Base URL *</Label>
              <Input value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder="https://api.example.com" />
              {!validUrl && form.base_url.length > 8 && (
                <p className="text-xs text-destructive mt-1">Must be a valid http(s) URL.</p>
              )}
            </div>
            <div>
              <Label>Auth type</Label>
              <Select value={form.auth_type} onValueChange={(v) => setForm({ ...form, auth_type: v as Auth })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUTH_OPTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Auth header name</Label>
              <Input value={form.auth_header_name} onChange={(e) => setForm({ ...form, auth_header_name: e.target.value })} placeholder="Authorization / X-API-Key" />
            </div>
            <div>
              <Label>Environment</Label>
              <Select value={form.environment} onValueChange={(v) => setForm({ ...form, environment: v as Env })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENV_OPTIONS.map((e) => <SelectItem key={e} value={e} className="capitalize">{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Health check path</Label>
              <Input value={form.health_check_path} onChange={(e) => setForm({ ...form, health_check_path: e.target.value })} placeholder="/health" />
            </div>
            <div>
              <Label>Timeout (ms)</Label>
              <Input type="number" min={1000} max={120000} value={form.timeout_ms}
                onChange={(e) => setForm({ ...form, timeout_ms: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Retries</Label>
              <Input type="number" min={0} max={5} value={form.retry_count}
                onChange={(e) => setForm({ ...form, retry_count: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Rate limit / min</Label>
              <Input type="number" min={1} max={6000} value={form.rate_limit_per_minute}
                onChange={(e) => setForm({ ...form, rate_limit_per_minute: Number(e.target.value) })} />
            </div>
            <div className="md:col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving || !validName || !validUrl}>
              {saving ? "Saving…" : "Add integration"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RestApiRegistryPanel;