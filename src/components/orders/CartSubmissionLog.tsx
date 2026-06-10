import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShoppingCart, RefreshCw, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";

interface Log {
  id: string;
  created_at: string;
  user_id: string;
  entity_id: string | null;
  metadata: any;
  display_name?: string;
}

const CartSubmissionLog = ({ orgId }: { orgId: string }) => {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("audit_logs")
      .select("id, created_at, user_id, entity_id, metadata")
      .eq("org_id", orgId)
      .eq("entity_type", "cart_submission")
      .order("created_at", { ascending: false })
      .limit(50);

    const rows = (data ?? []) as Log[];
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    if (userIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);
      const map = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name]));
      rows.forEach((r) => (r.display_name = map.get(r.user_id) || "Unknown"));
    }
    setLogs(rows);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [orgId]);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart size={16} className="text-primary" />
          <h3 className="font-heading font-semibold text-sm">Catalogue Cart Submissions</h3>
          <Badge variant="secondary" className="text-[10px]">{logs.length}</Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={load} className="h-7 text-xs">
          <RefreshCw size={12} className="mr-1" /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">
          No cart submissions yet. They will appear here when visitors submit a cart from your
          native site, the demo preview, or any embedded site.
        </p>
      ) : (
        <div className="space-y-2">
          {logs.map((l) => {
            const m = l.metadata || {};
            const expanded = expandedId === l.id;
            const mismatches = (m.price_mismatches ?? []) as any[];
            return (
              <div key={l.id} className="rounded-lg border border-border text-xs">
                <button
                  onClick={() => setExpandedId(expanded ? null : l.id)}
                  className="w-full text-left p-3 flex items-center gap-3 hover:bg-muted/30"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{l.display_name}</span>
                      <Badge variant="outline" className="text-[10px] capitalize">{m.role || "—"}</Badge>
                      <Badge variant="outline" className="text-[10px] capitalize">{m.source || "—"}</Badge>
                      {mismatches.length > 0 && (
                        <Badge className="bg-destructive/15 text-destructive text-[10px] gap-1">
                          <AlertTriangle size={10} /> Price mismatch
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-1">
                      {m.order_number} • {(m.lines || []).length} items • {m.currency}{" "}
                      {Number(m.total ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {new Date(l.created_at).toLocaleString()}
                  </span>
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {expanded && (
                  <div className="border-t border-border p-3 space-y-2 bg-muted/20">
                    <div>
                      <span className="text-muted-foreground">Customer:</span>{" "}
                      {m.customer?.name} ({m.customer?.email})
                    </div>
                    {m.origin_url && (
                      <div className="break-all">
                        <span className="text-muted-foreground">Origin:</span>{" "}
                        <a href={m.origin_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                          {m.origin_url}
                        </a>
                      </div>
                    )}
                    <div>
                      <p className="text-muted-foreground mb-1">Lines (server-verified prices):</p>
                      <ul className="space-y-0.5">
                        {(m.lines || []).map((line: any, idx: number) => (
                          <li key={idx} className="font-mono text-[11px]">
                            • {line.quantity}× {line.name} @ {m.currency} {Number(line.unit_price).toLocaleString()}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {mismatches.length > 0 && (
                      <div className="text-destructive">
                        <p className="font-medium">Client/server price mismatches:</p>
                        <ul>
                          {mismatches.map((mm, i) => (
                            <li key={i} className="font-mono text-[11px]">
                              • item {mm.id}: client {mm.client} → server {mm.server}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default CartSubmissionLog;