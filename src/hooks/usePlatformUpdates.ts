import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PlatformUpdateAudience = "all" | "admin" | "customer" | "org";
export type PlatformUpdateSeverity = "info" | "minor" | "major" | "critical";

export interface PlatformUpdate {
  id: string;
  version: string;
  title: string;
  notes: string | null;
  severity: PlatformUpdateSeverity;
  audience: PlatformUpdateAudience;
  force_reload: boolean;
  published_at: string;
}

const SEEN_KEY = "fsa.platform_updates.last_seen_id";

/**
 * Subscribes to `platform_updates` via Supabase Realtime and also polls
 * on tab focus, so PWAs (admin console, org customer apps) auto-discover
 * platform updates without a manual refresh.
 *
 * Filters by audience: pass the audience this surface represents
 * (e.g. "admin" for the super-admin console, "customer" for org apps).
 */
export const usePlatformUpdates = (audience: PlatformUpdateAudience = "all") => {
  const [latest, setLatest] = useState<PlatformUpdate | null>(null);
  const [isNew, setIsNew] = useState(false);
  const lastSeenRef = useRef<string | null>(
    typeof window !== "undefined" ? localStorage.getItem(SEEN_KEY) : null
  );

  const matchesAudience = useCallback(
    (u: PlatformUpdate) => u.audience === "all" || u.audience === audience,
    [audience]
  );

  const fetchLatest = useCallback(async () => {
    const { data, error } = await supabase
      .from("platform_updates")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(10);
    if (error || !data) return;
    const filtered = (data as PlatformUpdate[]).filter(matchesAudience);
    const top = filtered[0] ?? null;
    if (!top) return;
    setLatest(top);
    if (lastSeenRef.current !== top.id) {
      setIsNew(true);
      console.log("[FSA Platform Worker] New update detected:", top.version);
      if (top.force_reload && typeof window !== "undefined") {
        const updateSW = (window as any).__fsaUpdateSW as
          | ((reload?: boolean) => Promise<void>)
          | undefined;
        if (updateSW) {
          updateSW(true).catch(() => window.location.reload());
        } else {
          // Defer slightly so a toast can render first
          setTimeout(() => window.location.reload(), 1500);
        }
      }
    }
  }, [matchesAudience]);

  const markSeen = useCallback(() => {
    if (latest) {
      lastSeenRef.current = latest.id;
      try {
        localStorage.setItem(SEEN_KEY, latest.id);
      } catch {}
      setIsNew(false);
    }
  }, [latest]);

  useEffect(() => {
    fetchLatest();

    const channel = supabase
      .channel("platform-updates-worker")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "platform_updates" },
        (payload) => {
          const u = payload.new as PlatformUpdate;
          if (!matchesAudience(u)) return;
          fetchLatest();
        }
      )
      .subscribe();

    const onFocus = () => fetchLatest();
    window.addEventListener("focus", onFocus);
    const interval = window.setInterval(fetchLatest, 5 * 60 * 1000);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
    };
  }, [fetchLatest, matchesAudience]);

  return { latest, isNew, markSeen, refetch: fetchLatest };
};