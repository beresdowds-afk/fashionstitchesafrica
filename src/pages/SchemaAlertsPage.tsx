import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, Play } from "lucide-react";

interface Alert {
  id: string;
  severity: "info" | "warning" | "critical";
  source: string;
  object_type: string;
  object_name: string;
  column_name: string | null;
  message: string;
  dashboard_url: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  details: Record<string, unknown>;
}

const severityColor: Record<string, string> = {
  critical: "destructive",
  warning: "secondary",
  info: "outline",
};

export default function SchemaAlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("schema_validation_alerts").select("*").order("last_seen_at", { ascending: false }).limit(200);
    if (!showResolved) q = q.is("resolved_at", null);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setAlerts((data as Alert[] | null) ?? []);
    setLoading(false);
  }, [showResolved]);

  useEffect(() => { load(); }, [load]);

  const resolve = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("schema_validation_alerts")
      .update({ resolved_at: new Date().toISOString(), resolved_by: user?.id })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Resolved");
    load();
  };

  const runValidator = async (fn: "schema-validator" | "catalogue-health-check") => {
    setRunning(fn);
    const { data, error } = await supabase.functions.invoke(fn);
    setRunning(null);
    if (error) return toast.error(`${fn} failed: ${error.message}`);
    toast.success(`${fn}: ${JSON.stringify(data)}`);
    load();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-7 w-7 text-warning" />
            Schema Health Alerts
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Auto-detected mismatches between the client and live DB schema. Runs daily at 01:00 UTC.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => runValidator("schema-validator")} disabled={!!running}>
            <Play className="h-4 w-4 mr-1" /> Run validator
          </Button>
          <Button variant="outline" size="sm" onClick={() => runValidator("catalogue-health-check")} disabled={!!running}>
            <Play className="h-4 w-4 mr-1" /> Run health-check
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowResolved((s) => !s)}>
            {showResolved ? "Hide" : "Show"} resolved
          </Button>
          <Button variant="ghost" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading && <div className="text-muted-foreground">Loading…</div>}
      {!loading && alerts.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
            <CheckCircle2 className="h-10 w-10 text-primary" />
            <div>No open schema alerts. Everything checks out.</div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {alerts.map((a) => (
          <Card key={a.id} className={a.resolved_at ? "opacity-60" : ""}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={severityColor[a.severity] as never}>{a.severity}</Badge>
                  <Badge variant="outline">{a.source}</Badge>
                  <Badge variant="outline">{a.object_type}</Badge>
                  <CardTitle className="text-base font-mono">
                    {a.object_name}{a.column_name ? `.${a.column_name}` : ""}
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>×{a.occurrence_count}</span>
                  <span>last: {new Date(a.last_seen_at).toLocaleString()}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm">{a.message}</div>
              <div className="flex gap-2 flex-wrap">
                {a.dashboard_url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={a.dashboard_url} target="_blank" rel="noreferrer">
                      Open in DB <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  </Button>
                )}
                {!a.resolved_at && (
                  <Button size="sm" onClick={() => resolve(a.id)}>Mark resolved</Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}