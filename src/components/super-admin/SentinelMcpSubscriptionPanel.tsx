import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Mail, ShieldOff, Users, Shield, Loader2, AlertTriangle, Clock, Bot, HeartHandshake, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
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

interface ShieldActivation {
  status: string;
  requested_at: string | null;
  activated_at: string | null;
  last_error: string | null;
  attempt_count?: number;
  max_attempts?: number;
  last_attempt_at?: string | null;
  next_retry_at?: string | null;
  stuck_after_minutes?: number;
}

interface PlatformAgent {
  agent_key: string;
  agent_name: string;
  service_category: string;
  description: string | null;
  plan_key: string;
  status: string;
  requested_at: string | null;
  activated_at: string | null;
  last_error: string | null;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
}

const AGENT_ICON: Record<string, React.ElementType> = {
  steven_ai: Bot,
  rachel_crm: HeartHandshake,
};

const SentinelMcpSubscriptionPanel = () => {
  const [sub, setSub] = useState<PlatformSub | null>(null);
  const [stats, setStats] = useState({ totalSubs: 0, totalSeoRequests: 0 });
  const [shield, setShield] = useState<ShieldActivation | null>(null);
  const [activating, setActivating] = useState(false);
  const [agents, setAgents] = useState<PlatformAgent[]>([]);
  const [activatingAgent, setActivatingAgent] = useState<string | null>(null);

  const loadAll = async () => {
    const [{ data }, { count: subCount }, { count: seoCount }, { data: shieldRow }, { data: agentRows }] =
      await Promise.all([
        supabase.from("sentinel_mcp_platform_subscription" as any).select("*").eq("id", 1).maybeSingle(),
        supabase.from("sentinel_mcp_user_subscriptions" as any).select("*", { count: "exact", head: true }),
        supabase.from("seo_optimization_requests" as any).select("*", { count: "exact", head: true }),
        supabase.from("sentinel_shield_activation" as any).select("*").eq("id", 1).maybeSingle(),
        supabase.from("sentinel_platform_agents" as any).select("*").order("agent_name"),
      ]);
    setSub(data as unknown as PlatformSub);
    setStats({ totalSubs: subCount ?? 0, totalSeoRequests: seoCount ?? 0 });
    setShield(shieldRow as unknown as ShieldActivation);
    setAgents((agentRows as unknown as PlatformAgent[]) ?? []);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const requestShield = async () => {
    setActivating(true);
    try {
      const { data, error } = await supabase.functions.invoke("sentinel-mcp-worker", {
        body: { action: "activate-shield", force: true },
      });
      if (error) throw error;
      const status = (data as any)?.status;
      if (status === "active") toast.success("SENTINEL-SHIELD activated for FYSORA (free tier).");
      else if (status === "retrying")
        toast.info(
          `Sentinel MCP unreachable; retrying in ${(data as any)?.retry_in_seconds ?? "?"}s (attempt ${(data as any)?.activation?.attempt_count}/${(data as any)?.activation?.max_attempts}).`
        );
      else if (status === "requested") toast.info("Activation request queued — awaiting Sentinel MCP server.");
      else toast.error(`Activation failed: ${(data as any)?.activation?.last_error || "unknown error"}`);
      await loadAll();
    } catch (e: any) {
      toast.error(e?.message || "Failed to contact Sentinel MCP");
    } finally {
      setActivating(false);
    }
  };

  const activateAgent = async (agentKey: string) => {
    setActivatingAgent(agentKey);
    try {
      const { data, error } = await supabase.functions.invoke("sentinel-mcp-worker", {
        body: { action: "activate-agent", agent_key: agentKey, force: true },
      });
      if (error) throw error;
      const status = (data as any)?.status;
      const name = agents.find((a) => a.agent_key === agentKey)?.agent_name || agentKey;
      if (status === "active") toast.success(`${name} engaged for FYSORA (non-fee tier).`);
      else if (status === "retrying")
        toast.info(`${name}: Sentinel MCP unreachable; retrying in ${(data as any)?.retry_in_seconds ?? "?"}s.`);
      else if (status === "requested") toast.info(`${name} request queued.`);
      else toast.error(`${name} activation failed: ${(data as any)?.agent?.last_error || "unknown"}`);
      await loadAll();
    } catch (e: any) {
      toast.error(e?.message || "Failed to contact Sentinel MCP");
    } finally {
      setActivatingAgent(null);
    }
  };

  // Derive an alert state for stuck / failed / retry activations
  const alertState = useMemo(() => {
    if (!shield) return null;
    const stuckMins = shield.stuck_after_minutes ?? 30;
    const lastAttempt = shield.last_attempt_at ? new Date(shield.last_attempt_at) : null;
    const ageMins = lastAttempt ? (Date.now() - lastAttempt.getTime()) / 60000 : null;

    if (shield.status === "failed") {
      return {
        kind: "destructive" as const,
        title: "SENTINEL-SHIELD activation failed",
        body: `${shield.last_error ?? "Unknown error."} Click "Retry now" to force a fresh attempt.`,
      };
    }
    if (shield.status === "retrying") {
      return {
        kind: "default" as const,
        title: "Activation retrying",
        body: `Attempt ${shield.attempt_count}/${shield.max_attempts}. Next retry at ${shield.next_retry_at ? new Date(shield.next_retry_at).toLocaleTimeString() : "—"}.`,
      };
    }
    if (
      shield.status === "requested" &&
      ageMins !== null &&
      ageMins > stuckMins
    ) {
      return {
        kind: "destructive" as const,
        title: "Activation appears stuck",
        body: `No response from Sentinel MCP for ${Math.round(ageMins)} minutes (threshold ${stuckMins}m).`,
      };
    }
    return null;
  }, [shield]);

  // Auto-refresh activation status every 30s while retrying / requested
  useEffect(() => {
    if (!shield) return;
    if (shield.status !== "retrying" && shield.status !== "requested") return;
    const id = setInterval(loadAll, 30_000);
    return () => clearInterval(id);
  }, [shield?.status]);

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

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-semibold flex items-center gap-2">
            <Shield size={18} className="text-primary" /> SENTINEL-SHIELD (Free Platform Plan)
          </h3>
          <Badge
            variant={shield?.status === "active" ? "default" : "secondary"}
            className="capitalize"
          >
            {shield?.status?.replace(/_/g, " ") || "not requested"}
          </Badge>
        </div>

        {alertState && (
          <Alert variant={alertState.kind}>
            {alertState.kind === "destructive" ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <Clock className="h-4 w-4" />
            )}
            <AlertTitle>{alertState.title}</AlertTitle>
            <AlertDescription>{alertState.body}</AlertDescription>
          </Alert>
        )}

        <p className="text-xs text-muted-foreground">
          Includes WAF baseline, DDoS shielding, abuse detection, audit forwarding and uptime probes
          for the FYSORA platform. <strong>Does not</strong> extend to organization, designer or
          tailor users — they must subscribe to paid Security/Observability add-ons individually.
        </p>
        {shield?.requested_at && (
          <p className="text-xs text-muted-foreground">
            Last requested: {new Date(shield.requested_at).toLocaleString()}
          </p>
        )}
        {shield?.activated_at && (
          <p className="text-xs text-muted-foreground">
            Activated: {new Date(shield.activated_at).toLocaleString()}
          </p>
        )}
        {shield?.last_error && shield.status !== "active" && (
          <p className="text-xs text-destructive">{shield.last_error}</p>
        )}
        {(shield?.attempt_count ?? 0) > 0 && shield?.status !== "active" && (
          <p className="text-xs text-muted-foreground">
            Attempts: {shield?.attempt_count}/{shield?.max_attempts}
            {shield?.next_retry_at && (
              <> · next retry {new Date(shield.next_retry_at).toLocaleTimeString()}</>
            )}
          </p>
        )}
        <div className="pt-1">
          <Button onClick={requestShield} disabled={activating} size="sm">
            {activating ? (
              <><Loader2 size={14} className="mr-2 animate-spin" /> Requesting…</>
            ) : shield?.status === "active" ? (
              <><Shield size={14} className="mr-2" /> Re-confirm activation</>
            ) : shield?.status === "failed" || shield?.status === "retrying" ? (
              <><Shield size={14} className="mr-2" /> Retry now</>
            ) : (
              <><Shield size={14} className="mr-2" /> Request free SENTINEL-SHIELD</>
            )}
          </Button>
        </div>
      </Card>

      <SentinelAddonsMarketplace title="Available Sentinel MCP Add-Ons (User Pricing)" />
    </div>
  );
};

export default SentinelMcpSubscriptionPanel;
