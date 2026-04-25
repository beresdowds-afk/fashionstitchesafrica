import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTourSyncState } from "@/hooks/usePlatformTourTracks";

/**
 * Auto-runs the voiced-tour regeneration worker whenever the platform tour
 * goes stale (i.e. a new platform_updates row was inserted, which trips
 * the `mark_tour_stale_on_platform_update` trigger).
 *
 * Mount once near the app root. Idempotent and rate-limited per browser tab
 * (15-minute cooldown) so multiple PWAs don't all hammer the function.
 */
const COOLDOWN_MS = 15 * 60 * 1000;
const LAST_RUN_KEY = "fsa.tour_sync.last_run_at";

export const TourSyncWorker = () => {
  const { state } = useTourSyncState();
  const inFlight = useRef(false);

  useEffect(() => {
    if (!state?.is_stale || inFlight.current) return;

    let lastRun = 0;
    try { lastRun = Number(localStorage.getItem(LAST_RUN_KEY) || 0); } catch {}
    if (Date.now() - lastRun < COOLDOWN_MS) return;

    inFlight.current = true;
    try { localStorage.setItem(LAST_RUN_KEY, String(Date.now())); } catch {}

    supabase.functions
      .invoke("sync-voiced-tour", { body: { role: "all" } })
      .then(({ error }) => {
        if (error) console.warn("[TourSyncWorker] sync failed:", error.message);
        else console.log("[TourSyncWorker] voiced tour regenerated");
      })
      .catch((e) => console.warn("[TourSyncWorker] invocation error:", e?.message))
      .finally(() => { inFlight.current = false; });
  }, [state?.is_stale]);

  return null;
};

export default TourSyncWorker;
