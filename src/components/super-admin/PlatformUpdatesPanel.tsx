import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Radio, Loader2 } from "lucide-react";
import type {
  PlatformUpdate,
  PlatformUpdateAudience,
  PlatformUpdateSeverity,
} from "@/hooks/usePlatformUpdates";

const SEVERITIES: PlatformUpdateSeverity[] = ["info", "minor", "major", "critical"];
const AUDIENCES: PlatformUpdateAudience[] = ["all", "admin", "customer", "org"];

const severityVariant = (s: PlatformUpdateSeverity) =>
  s === "critical" ? "destructive" : s === "major" ? "default" : "secondary";

export const PlatformUpdatesPanel = () => {
  const [updates, setUpdates] = useState<PlatformUpdate[]>([]);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [severity, setSeverity] = useState<PlatformUpdateSeverity>("info");
  const [audience, setAudience] = useState<PlatformUpdateAudience>("all");
  const [forceReload, setForceReload] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("platform_updates")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(20);
    setLoading(false);
    if (error) {
      toast.error("Failed to load platform updates");
      return;
    }
    setUpdates((data ?? []) as PlatformUpdate[]);
  };

  useEffect(() => {
    load();
  }, []);

  const publish = async () => {
    if (!version.trim() || !title.trim()) {
      toast.error("Version and title are required");
      return;
    }
    setPublishing(true);
    const { error } = await supabase.from("platform_updates").insert({
      version: version.trim(),
      title: title.trim(),
      notes: notes.trim() || null,
      severity,
      audience,
      force_reload: forceReload,
    });
    setPublishing(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Update v${version} broadcast to ${audience} PWAs`);
    setVersion("");
    setTitle("");
    setNotes("");
    setSeverity("info");
    setAudience("all");
    setForceReload(false);
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("platform_updates").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Update removed");
    load();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" /> Broadcast Platform Update
          </CardTitle>
          <CardDescription>
            Push a version/feature update to all connected PWAs (admin console + organization
            customer apps). Connected clients receive it instantly via realtime; offline clients
            pick it up on next focus.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pu-version">Version</Label>
              <Input
                id="pu-version"
                placeholder="e.g. 2.4.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pu-title">Title</Label>
              <Input
                id="pu-title"
                placeholder="e.g. Voiced platform tour & catalogue refresh"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pu-notes">Release notes</Label>
            <Textarea
              id="pu-notes"
              placeholder="What's new in this release…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Severity</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as PlatformUpdateSeverity)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Audience</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as PlatformUpdateAudience)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pu-force">Force PWA reload</Label>
              <div className="flex items-center gap-3 h-10">
                <Switch id="pu-force" checked={forceReload} onCheckedChange={setForceReload} />
                <span className="text-sm text-muted-foreground">
                  {forceReload ? "Auto-refresh clients" : "Toast with manual reload"}
                </span>
              </div>
            </div>
          </div>
          <Button onClick={publish} disabled={publishing} className="w-full md:w-auto">
            {publishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Broadcast update
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent broadcasts</CardTitle>
          <CardDescription>Last 20 platform updates published to PWAs.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : updates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No updates broadcast yet.</p>
          ) : (
            <div className="space-y-3">
              {updates.map((u) => (
                <div
                  key={u.id}
                  className="flex items-start justify-between gap-4 rounded-md border p-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">v{u.version}</span>
                      <span className="text-foreground">{u.title}</span>
                      <Badge variant={severityVariant(u.severity)}>{u.severity}</Badge>
                      <Badge variant="outline">{u.audience}</Badge>
                      {u.force_reload && <Badge>force-reload</Badge>}
                    </div>
                    {u.notes && (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{u.notes}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(u.published_at).toLocaleString()}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => remove(u.id)}>
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PlatformUpdatesPanel;