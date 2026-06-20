import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { ShieldCheck, ShieldAlert, MessageSquare, FileText, Star, ArrowRight } from "lucide-react";

type Entry = {
  id: string;
  action_type: string;
  description: string | null;
  attachments: any[];
  metadata: any;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
};

export function useClaimAuditTimeline(claimId: string | undefined) {
  return useQuery({
    queryKey: ["claim-audit-timeline", claimId],
    enabled: !!claimId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_claim_audit_timeline", { _claim_id: claimId });
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
    refetchInterval: 30_000,
  });
}

function iconFor(type: string) {
  if (type === "message") return MessageSquare;
  if (type === "rating") return Star;
  if (type.startsWith("evidence")) return ShieldCheck;
  if (type === "rejected") return ShieldAlert;
  return FileText;
}

export function ClaimAuditTimeline({
  claimId,
  variant = "full",
}: { claimId: string; variant?: "full" | "customer" }) {
  const { data: entries = [], isLoading } = useClaimAuditTimeline(claimId);

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading audit log…</p>;
  if (!entries.length) return <p className="text-xs text-muted-foreground">No activity yet.</p>;

  const visible = variant === "customer"
    ? entries.filter((e) => e.action_type !== "internal_note")
    : entries;

  return (
    <ol className="relative space-y-3 border-l border-border pl-4">
      {visible.map((e) => {
        const Icon = iconFor(e.action_type);
        const meta = e.metadata || {};
        const from = meta.from as string | undefined;
        const to = meta.to as string | undefined;
        return (
          <li key={e.id} className="relative">
            <span className={cn(
              "absolute -left-[21px] flex h-3 w-3 items-center justify-center rounded-full",
              e.action_type === "rejected" ? "bg-destructive" : "bg-[hsl(43,65%,52%)]",
            )} />
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium capitalize flex items-center gap-1">
                <Icon size={12} /> {e.action_type.replace(/_/g, " ")}
              </span>
              {from && to && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground capitalize">
                  {from.replace(/_/g, " ")} <ArrowRight size={9} /> {to.replace(/_/g, " ")}
                </span>
              )}
              <span className="ml-auto text-[10px] text-muted-foreground">
                {format(new Date(e.created_at), "PPp")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {e.actor_name ?? "System"}
              {e.description ? <> — <span className="text-foreground">{e.description}</span></> : null}
            </p>
            {variant === "full" && meta?.amount_approved != null && (
              <p className="text-[10px] text-muted-foreground">Amount approved: {meta.amount_approved}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default ClaimAuditTimeline;