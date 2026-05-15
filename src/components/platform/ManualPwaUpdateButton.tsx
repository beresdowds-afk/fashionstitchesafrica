import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, Loader2 } from "lucide-react";

/**
 * Super Admin manual update button.
 * Triggers the PWA sync worker (regenerates the voiced tour for all
 * audiences) and forces a service-worker update so installed PWAs pick
 * up the latest build immediately.
 */
const ManualPwaUpdateButton = ({ compact = false }: { compact?: boolean }) => {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);

  const handleClick = async () => {
    if (running) return;
    setRunning(true);
    try {
      // 1. Kick the voiced-tour regeneration worker for every audience
      const { error } = await supabase.functions.invoke("sync-voiced-tour", {
        body: { role: "all" },
      });
      if (error) throw error;

      // 2. Force this PWA's service worker to update + reload other tabs
      const updateSW = (window as any).__fsaUpdateSW as
        | ((reload?: boolean) => Promise<void>)
        | undefined;
      if (updateSW) {
        try {
          await updateSW(true);
        } catch {
          /* fall through to manual reload */
        }
      } else if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update()));
      }

      toast({
        title: "PWA sync triggered",
        description: "Voiced tour regenerated and service workers updated.",
      });
    } catch (err: any) {
      toast({
        title: "Update failed",
        description: err?.message || "Could not trigger the PWA sync worker.",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size={compact ? "icon" : "sm"}
      onClick={handleClick}
      disabled={running}
      title="Sync PWA — regenerate tour and update service workers"
      className="text-ivory/70 hover:text-ivory h-8"
    >
      {running ? (
        <Loader2 size={14} className={compact ? "animate-spin" : "mr-1 animate-spin"} />
      ) : (
        <RefreshCw size={14} className={compact ? "" : "mr-1"} />
      )}
      {!compact && (running ? "Syncing…" : "Sync PWA")}
    </Button>
  );
};

export default ManualPwaUpdateButton;