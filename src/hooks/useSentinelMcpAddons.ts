import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SentinelAddon {
  id: string;
  addon_key: string;
  name: string;
  description: string;
  category: string;
  monthly_price_usd: number;
  per_request_price_usd: number | null;
  available_to_roles: string[];
  mcp_tool_name: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
}

export interface SentinelUserSubscription {
  id: string;
  addon_id: string;
  user_id: string | null;
  org_id: string | null;
  status: string;
  billing_cycle: string;
  amount_usd: number;
  current_period_start: string;
  current_period_end: string | null;
}

export function useSentinelMcpAddons(orgId?: string) {
  const [addons, setAddons] = useState<SentinelAddon[]>([]);
  const [subscriptions, setSubscriptions] = useState<SentinelUserSubscription[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [{ data: addonRows }, { data: subRows }] = await Promise.all([
      supabase
        .from("sentinel_mcp_addons" as any)
        .select("*")
        .eq("is_active", true)
        .order("monthly_price_usd", { ascending: true }),
      supabase
        .from("sentinel_mcp_user_subscriptions" as any)
        .select("*"),
    ]);
    setAddons((addonRows as unknown as SentinelAddon[]) ?? []);
    setSubscriptions((subRows as unknown as SentinelUserSubscription[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const subscribe = useCallback(async (addon: SentinelAddon) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const { error } = await supabase
        .from("sentinel_mcp_user_subscriptions" as any)
        .insert({
          addon_id: addon.id,
          user_id: orgId ? null : userData.user.id,
          org_id: orgId ?? null,
          status: "pending",
          billing_cycle: "monthly",
          amount_usd: addon.monthly_price_usd,
          current_period_end: periodEnd.toISOString(),
        });
      if (error) throw error;
      toast.success(`Subscribed to ${addon.name} — pending payment`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Subscription failed");
    }
  }, [orgId, refresh]);

  const isSubscribed = useCallback((addonId: string) =>
    subscriptions.some((s) => s.addon_id === addonId && ["active", "pending"].includes(s.status)),
  [subscriptions]);

  return { addons, subscriptions, loading, subscribe, isSubscribed, refresh };
}
