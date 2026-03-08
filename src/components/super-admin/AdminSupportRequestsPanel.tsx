import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LifeBuoy, CheckCircle2, Clock, AlertCircle, Building2 } from "lucide-react";
import { motion } from "framer-motion";

interface SupportRequest {
  id: string;
  user_id: string;
  org_id: string | null;
  provider: string;
  subject: string;
  description: string | null;
  status: string;
  resolution_notes: string | null;
  created_at: string;
  org_name?: string;
  user_name?: string;
}

const AdminSupportRequestsPanel = () => {
  const { toast } = useToast();
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [resolving, setResolving] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("admin_support_requests" as any)
      .select("*")
      .eq("request_type", "payment_gateway_setup")
      .order("created_at", { ascending: false });

    if (filter !== "all") query = query.eq("status", filter);

    const { data } = await query;
    const items = (data as unknown as SupportRequest[]) || [];

    // Enrich with org names and user names
    const orgIds = [...new Set(items.filter(r => r.org_id).map(r => r.org_id!))];
    const userIds = [...new Set(items.map(r => r.user_id))];

    const [{ data: orgs }, { data: profiles }] = await Promise.all([
      orgIds.length > 0
        ? supabase.from("organizations").select("id, name").in("id", orgIds)
        : Promise.resolve({ data: [] }),
      userIds.length > 0
        ? supabase.from("profiles").select("id, display_name").in("id", userIds)
        : Promise.resolve({ data: [] }),
    ]);

    const orgMap = Object.fromEntries((orgs || []).map((o: any) => [o.id, o.name]));
    const userMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p.display_name]));

    setRequests(items.map(r => ({
      ...r,
      org_name: r.org_id ? orgMap[r.org_id] || "Unknown" : "N/A",
      user_name: userMap[r.user_id] || "Unknown",
    })));
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleResolve = async (id: string, newStatus: string) => {
    setResolving(id);
    const { error } = await supabase.from("admin_support_requests" as any).update({
      status: newStatus,
      resolution_notes: notes[id] || null,
      resolved_at: newStatus === "resolved" ? new Date().toISOString() : null,
    } as any).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Request ${newStatus}` });
      fetchRequests();
    }
    setResolving(null);
  };

  const statusIcon = (s: string) => {
    if (s === "resolved") return <CheckCircle2 size={14} className="text-primary" />;
    if (s === "in_progress") return <Clock size={14} className="text-chart-4" />;
    return <AlertCircle size={14} className="text-muted-foreground" />;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl flex items-center gap-2">
            <LifeBuoy size={22} className="text-primary" /> Support Requests
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Payment gateway setup assistance requests from organizations, tailors, and designers.
          </p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>
      ) : requests.length === 0 ? (
        <Card className="p-8 text-center">
          <LifeBuoy size={32} className="text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No support requests found.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map(r => (
            <Card key={r.id} className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {statusIcon(r.status)}
                    <span className="font-medium text-sm">{r.subject}</span>
                    <Badge variant="outline" className="capitalize text-xs">{r.provider}</Badge>
                    <Badge variant={r.status === "resolved" ? "default" : r.status === "in_progress" ? "secondary" : "outline"} className="capitalize text-xs">
                      {r.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>By: {r.user_name}</span>
                    {r.org_name !== "N/A" && (
                      <span className="flex items-center gap-1">
                        <Building2 size={12} /> {r.org_name}
                      </span>
                    )}
                    <span>{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                  {r.description && (
                    <p className="text-sm text-muted-foreground mt-2 bg-muted/30 p-2 rounded">{r.description}</p>
                  )}
                </div>
              </div>

              {r.status !== "resolved" && (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Textarea
                      value={notes[r.id] || ""}
                      onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))}
                      placeholder="Resolution notes (optional)"
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {r.status === "pending" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResolve(r.id, "in_progress")}
                        disabled={resolving === r.id}
                      >
                        <Clock size={14} className="mr-1" /> In Progress
                      </Button>
                    )}
                    <Button
                      variant="hero"
                      size="sm"
                      onClick={() => handleResolve(r.id, "resolved")}
                      disabled={resolving === r.id}
                    >
                      <CheckCircle2 size={14} className="mr-1" /> Resolve
                    </Button>
                  </div>
                </div>
              )}
              {r.resolution_notes && r.status === "resolved" && (
                <p className="text-xs text-muted-foreground bg-primary/5 p-2 rounded">
                  <strong>Resolution:</strong> {r.resolution_notes}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default AdminSupportRequestsPanel;
