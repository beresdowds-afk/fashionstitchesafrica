import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Globe, Plus, Trash2, CheckCircle2, Clock, Loader2, RefreshCw, Copy, Edit2,
  Mail, Activity, ChevronDown, History, XCircle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface DnsRecord {
  id: string;
  domain: string;
  record_type: string;
  name: string;
  value: string;
  ttl: number;
  priority: number | null;
  purpose: string | null;
  notes: string | null;
  verified_at: string | null;
  last_checked_at: string | null;
}

const TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"];

const blank = {
  id: "",
  domain: "fs-africa.org.ng",
  record_type: "A",
  name: "@",
  value: "",
  ttl: 3600,
  priority: null as number | null,
  purpose: "",
  notes: "",
};

const PlatformDnsRecordsPanel = () => {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<typeof blank>(blank);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [syncingDkim, setSyncingDkim] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [propOpen, setPropOpen] = useState(false);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["platform-dns-records"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_dns_records" as any)
        .select("*")
        .order("domain")
        .order("record_type");
      if (error) throw error;
      return (data || []) as unknown as DnsRecord[];
    },
  });

  const { data: propChecks = [] } = useQuery({
    queryKey: ["dns-propagation-checks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dns_propagation_checks" as any)
        .select("*")
        .order("checked_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: propOpen,
  });

  const { data: auditRows = [] } = useQuery({
    queryKey: ["dns-record-audit"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dns_record_audit" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: propOpen,
  });

  const syncDkim = async () => {
    setSyncingDkim(true);
    const { data, error } = await supabase.functions.invoke("resend-dkim-sync", { body: {} });
    setSyncingDkim(false);
    if (error) {
      toast({ title: "DKIM sync failed", description: error.message, variant: "destructive" });
    } else {
      const changed = data?.changes?.length ?? data?.updated ?? 0;
      toast({ title: "DKIM sync complete", description: `${changed} record(s) updated from Resend.` });
    }
    qc.invalidateQueries({ queryKey: ["platform-dns-records"] });
    qc.invalidateQueries({ queryKey: ["dns-record-audit"] });
  };

  const runSweep = async () => {
    setSweeping(true);
    const { error } = await supabase.functions.invoke("dns-propagation-sweep", { body: {} });
    setSweeping(false);
    if (error) {
      toast({ title: "Sweep failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Propagation sweep started", description: "Checked all records across global resolvers." });
      qc.invalidateQueries({ queryKey: ["dns-propagation-checks"] });
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        domain: form.domain.trim().toLowerCase(),
        record_type: form.record_type,
        name: form.name.trim() || "@",
        value: form.value.trim(),
        ttl: Number(form.ttl) || 3600,
        priority: form.priority,
        purpose: form.purpose || null,
        notes: form.notes || null,
      };
      if (form.id) {
        const { error } = await supabase.from("platform_dns_records" as any).update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("platform_dns_records" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: form.id ? "Record updated" : "Record added" });
      setOpen(false);
      setForm(blank);
      qc.invalidateQueries({ queryKey: ["platform-dns-records"] });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("platform_dns_records" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Record deleted" });
      qc.invalidateQueries({ queryKey: ["platform-dns-records"] });
    },
  });

  const verifyRecord = async (r: DnsRecord) => {
    setVerifying(r.id);
    const { data, error } = await supabase.functions.invoke("dns-lookup", {
      body: {
        record_id: r.id,
        domain: r.domain,
        name: r.name,
        record_type: r.record_type,
        expected_value: r.value,
      },
    });
    setVerifying(null);
    if (error) {
      toast({ title: "Lookup failed", description: error.message, variant: "destructive" });
    } else if (data?.matched) {
      toast({ title: "Verified", description: `Live DNS matches the configured value.` });
    } else {
      toast({ title: "Not matching", description: `Found ${(data?.found || []).length} record(s); none contain the expected value.`, variant: "destructive" });
    }
    qc.invalidateQueries({ queryKey: ["platform-dns-records"] });
  };

  const grouped = records.reduce<Record<string, DnsRecord[]>>((acc, r) => {
    (acc[r.domain] = acc[r.domain] || []).push(r);
    return acc;
  }, {});

  const copyZone = (domain: string, rows: DnsRecord[]) => {
    const text = rows
      .map((r) => `${r.name === "@" ? "@" : r.name}\t${r.ttl}\tIN\t${r.record_type}\t${r.priority ?? ""} ${r.value}`.trim())
      .join("\n");
    navigator.clipboard.writeText(`; Zone file for ${domain}\n${text}\n`);
    toast({ title: "Copied as zone file" });
  };

  const editRecord = (r: DnsRecord) => {
    setForm({
      id: r.id, domain: r.domain, record_type: r.record_type, name: r.name,
      value: r.value, ttl: r.ttl, priority: r.priority, purpose: r.purpose || "",
      notes: r.notes || "",
    });
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Globe size={20} className="text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Platform DNS Records</CardTitle>
              <CardDescription className="text-xs">
                A, AAAA, CNAME, MX, TXT, NS, SRV, CAA — for FYSORA FASHN-owned domains
              </CardDescription>
            </div>
          </div>
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(blank); }}>
            <DialogTrigger asChild>
              <Button size="sm" variant="hero"><Plus size={14} className="mr-1" /> Add record</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{form.id ? "Edit DNS record" : "New DNS record"}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Domain</Label>
                  <Input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="fs-africa.org.ng" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select value={form.record_type} onValueChange={(v) => setForm({ ...form, record_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Name / Host</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="@ or www or _dmarc" />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Value</Label>
                  <Textarea
                    value={form.value}
                    onChange={(e) => setForm({ ...form, value: e.target.value })}
                    placeholder='IP, target, or quoted TXT value'
                    rows={3}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">TTL (s)</Label>
                  <Input type="number" value={form.ttl} onChange={(e) => setForm({ ...form, ttl: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Priority (MX/SRV)</Label>
                  <Input
                    type="number"
                    value={form.priority ?? ""}
                    onChange={(e) => setForm({ ...form, priority: e.target.value ? Number(e.target.value) : null })}
                    placeholder="10"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Purpose</Label>
                  <Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} placeholder="SPF, DMARC, mailbox routing…" />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Notes</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending || !form.value.trim()}>
                  {save.isPending ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                  {form.id ? "Save changes" : "Add record"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <Button size="sm" variant="outline" onClick={syncDkim} disabled={syncingDkim}>
            {syncingDkim ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Mail size={14} className="mr-1" />}
            Sync DKIM
          </Button>
          <Button size="sm" variant="outline" onClick={runSweep} disabled={sweeping}>
            {sweeping ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Activity size={14} className="mr-1" />}
            Run propagation sweep
          </Button>
          <span className="text-[10px] text-muted-foreground ml-auto">
            Automated: DKIM daily 03:00 UTC · Sweep hourly
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-5">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 size={18} className="animate-spin text-muted-foreground" />
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No DNS records configured yet.</p>
        ) : (
          Object.entries(grouped).map(([domain, rows]) => (
            <div key={domain} className="rounded-lg border border-border overflow-hidden">
              <div className="bg-muted/40 px-4 py-2 flex items-center gap-2">
                <span className="font-heading font-semibold text-sm">{domain}</span>
                <Badge variant="secondary" className="ml-2 text-[10px]">{rows.length} records</Badge>
                <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={() => copyZone(domain, rows)}>
                  <Copy size={12} className="mr-1" /> Copy zone
                </Button>
              </div>
              <div className="divide-y divide-border">
                {rows.map((r) => (
                  <div key={r.id} className="px-4 py-3 grid grid-cols-12 gap-2 items-center text-xs">
                    <div className="col-span-1 font-mono font-semibold">{r.record_type}</div>
                    <div className="col-span-2 font-mono truncate">{r.name}</div>
                    <div className="col-span-5 font-mono break-all text-muted-foreground">{r.value}</div>
                    <div className="col-span-2 text-muted-foreground">
                      {r.purpose || <span className="opacity-60">—</span>}
                    </div>
                    <div className="col-span-1 flex items-center gap-1">
                      {r.verified_at ? (
                        <Badge variant="default" className="text-[10px] gap-1"><CheckCircle2 size={10} /> OK</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] gap-1"><Clock size={10} /> Pending</Badge>
                      )}
                    </div>
                    <div className="col-span-1 flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => verifyRecord(r)} disabled={verifying === r.id}>
                        {verifying === r.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => editRecord(r)}>
                        <Edit2 size={12} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => { if (confirm("Delete this DNS record?")) remove.mutate(r.id); }}
                      >
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {/* DNS Propagation + Audit expansion */}
        <Collapsible open={propOpen} onOpenChange={setPropOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between border border-dashed">
              <span className="flex items-center gap-2 text-xs">
                <Activity size={14} /> DNS propagation &amp; audit history
              </span>
              <ChevronDown size={14} className={`transition-transform ${propOpen ? "rotate-180" : ""}`} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-3">
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="bg-muted/40 px-3 py-2 text-xs font-semibold flex items-center gap-2">
                <Activity size={12} /> Latest resolver sweep ({propChecks.length})
              </div>
              {propChecks.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-4">
                  No propagation checks yet. Run a sweep above.
                </p>
              ) : (
                <div className="divide-y divide-border text-[11px]">
                  {propChecks.slice(0, 50).map((c: any) => {
                    const rec = records.find((r) => r.id === c.record_id);
                    return (
                      <div key={c.id} className="px-3 py-2 grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-3 truncate font-mono">
                          {rec ? `${rec.name === "@" ? rec.domain : `${rec.name}.${rec.domain}`} ${rec.record_type}` : c.record_id?.slice(0,8)}
                        </div>
                        <div className="col-span-2 text-muted-foreground">{c.resolver_label || c.resolver}</div>
                        <div className="col-span-1">
                          {c.matched ? (
                            <Badge variant="default" className="text-[9px] gap-1"><CheckCircle2 size={9} /> OK</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[9px] gap-1"><XCircle size={9} /> Miss</Badge>
                          )}
                        </div>
                        <div className="col-span-1 text-muted-foreground">{c.latency_ms ?? "—"}ms</div>
                        <div className="col-span-3 text-muted-foreground truncate font-mono">
                          {(c.found_values || []).join(", ") || (c.error ? `err: ${c.error}` : "—")}
                        </div>
                        <div className="col-span-2 text-right text-muted-foreground">
                          {new Date(c.checked_at).toLocaleString()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border overflow-hidden">
              <div className="bg-muted/40 px-3 py-2 text-xs font-semibold flex items-center gap-2">
                <History size={12} /> Record audit history ({auditRows.length})
              </div>
              {auditRows.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-4">No audit events recorded.</p>
              ) : (
                <div className="divide-y divide-border text-[11px]">
                  {auditRows.map((a: any) => (
                    <div key={a.id} className="px-3 py-2 grid grid-cols-12 gap-2 items-start">
                      <div className="col-span-3 font-mono truncate">{a.name === "@" ? a.domain : `${a.name}.${a.domain}`}</div>
                      <div className="col-span-1 font-mono">{a.record_type}</div>
                      <div className="col-span-1">
                        <Badge variant="secondary" className="text-[9px] capitalize">{a.source}</Badge>
                      </div>
                      <div className="col-span-3 font-mono truncate text-muted-foreground">
                        {a.old_value ? `− ${a.old_value.slice(0, 40)}` : <span className="opacity-60">created</span>}
                      </div>
                      <div className="col-span-2 font-mono truncate">
                        {a.new_value ? `+ ${a.new_value.slice(0, 40)}` : <span className="opacity-60">removed</span>}
                      </div>
                      <div className="col-span-2 text-right text-muted-foreground">
                        {new Date(a.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
};

export default PlatformDnsRecordsPanel;