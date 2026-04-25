import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, RefreshCw, Volume2, AlertCircle, CheckCircle2 } from "lucide-react";
import { useTourSyncState, usePlatformTourTracks } from "@/hooks/usePlatformTourTracks";
import { tourRoleList } from "@/config/roleTourTracks";

const VoicedTourSyncPanel = () => {
  const { state, refetch: refetchState } = useTourSyncState();
  const { tracks } = usePlatformTourTracks();
  const [running, setRunning] = useState<string | null>(null);

  const runSync = async (role: "all" | typeof tourRoleList[number]) => {
    setRunning(role);
    try {
      const { data, error } = await supabase.functions.invoke("sync-voiced-tour", { body: { role } });
      if (error) throw error;
      const ok = (data as any)?.ok;
      toast(ok ? "Voiced tour regenerated" : "Tour sync completed with issues", {
        description: ((data as any)?.results || []).map((r: any) => `${r.role}: ${r.status}`).join(" · "),
      });
      refetchState();
    } catch (e: any) {
      toast.error("Sync failed", { description: e?.message ?? "Unknown error" });
    } finally {
      setRunning(null);
    }
  };

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Volume2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-lg">Voiced Tour Sync</h2>
            <p className="text-sm text-muted-foreground max-w-xl">
              Regenerates the role-based voiced platform tour from the latest feature inventory.
              Auto-runs whenever a new platform update is published; trigger manually below.
            </p>
          </div>
        </div>
        <Button
          onClick={() => runSync("all")}
          disabled={running !== null}
          className="gap-2"
        >
          {running === "all" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Regenerate all roles
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Status</p>
          <div className="flex items-center gap-2">
            {state?.is_stale ? (
              <Badge variant="destructive" className="gap-1 text-[10px]">
                <AlertCircle size={10} /> Stale — needs sync
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1 text-[10px]">
                <CheckCircle2 size={10} /> Up to date
              </Badge>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Last successful sync</p>
          <p className="text-sm font-medium">
            {state?.last_sync_success_at
              ? new Date(state.last_sync_success_at).toLocaleString()
              : "Never"}
          </p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Last status</p>
          <p className="text-sm font-medium capitalize">{state?.last_sync_status ?? "—"}</p>
          {state?.last_sync_message && (
            <p className="text-[10px] text-muted-foreground truncate" title={state.last_sync_message}>
              {state.last_sync_message}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Per-role tracks</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {tourRoleList.map((role) => {
            const t = tracks[role];
            return (
              <div key={role} className="rounded-lg border border-border p-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold">{t.label}</p>
                    <Badge variant="outline" className="text-[10px]">{t.steps.length} steps</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{t.tagline}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => runSync(role)}
                  disabled={running !== null}
                  className="gap-1 text-[11px] h-7 shrink-0"
                >
                  {running === role ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                  Resync
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
};

export default VoicedTourSyncPanel;
