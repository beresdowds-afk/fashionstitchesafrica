import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Mail, ShieldOff, Users } from "lucide-react";
import SentinelAddonsMarketplace from "@/components/sentinel/SentinelAddonsMarketplace";

interface PlatformSub {
  client_name: string;
  contact_email: string;
  billing_tier: string;
  is_active: boolean;
  cascades_to_users: boolean;
  notes: string | null;
  subscribed_at: string;
}

const SentinelMcpSubscriptionPanel = () => {
  const [sub, setSub] = useState<PlatformSub | null>(null);
  const [stats, setStats] = useState({ totalSubs: 0, totalSeoRequests: 0 });

  useEffect(() => {
    (async () => {
      const [{ data }, { count: subCount }, { count: seoCount }] = await Promise.all([
        supabase.from("sentinel_mcp_platform_subscription" as any).select("*").eq("id", 1).maybeSingle(),
        supabase.from("sentinel_mcp_user_subscriptions" as any).select("*", { count: "exact", head: true }),
        supabase.from("seo_optimization_requests" as any).select("*", { count: "exact", head: true }),
      ]);
      setSub(data as unknown as PlatformSub);
      setStats({ totalSubs: subCount ?? 0, totalSeoRequests: seoCount ?? 0 });
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-2xl flex items-center gap-2">
          <Sparkles size={22} className="text-primary" /> Sentinel MCP Subscription
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Platform-level integration with the Sentinel MCP service.
        </p>
      </div>

      <Card className="p-5 space-y-3">
        {sub ? (
          <>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-semibold">{sub.client_name}</h3>
              <Badge variant="default" className="capitalize">
                {sub.billing_tier.replace(/_/g, " ")}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground space-y-2">
              <div className="flex items-center gap-2"><Mail size={14} /> {sub.contact_email}</div>
              <div className="flex items-center gap-2">
                <ShieldOff size={14} />
                Non-fee status <strong>does not</strong> cascade to users (Tailors, Designers, Organizations).
              </div>
              <div className="flex items-center gap-2">
                <Users size={14} /> Active user add-on subscriptions: <strong>{stats.totalSubs}</strong>
              </div>
              <div>SEO requests routed to Sentinel MCP: <strong>{stats.totalSeoRequests}</strong></div>
              {sub.notes && <p className="text-foreground/80 pt-2 border-t border-border">{sub.notes}</p>}
              <p className="pt-1">Subscribed since {new Date(sub.subscribed_at).toLocaleDateString()}</p>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Loading subscription…</p>
        )}
      </Card>

      <SentinelAddonsMarketplace title="Available Sentinel MCP Add-Ons (User Pricing)" />
    </div>
  );
};

export default SentinelMcpSubscriptionPanel;
