import { useState } from "react";
import { useDisputes } from "@/hooks/useDisputes";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Scale, AlertCircle, Bot, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

const statusColors: Record<string, string> = {
  open: "bg-destructive/10 text-destructive",
  under_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  mediation: "bg-primary/10 text-primary",
  resolved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  closed: "bg-muted text-muted-foreground",
  escalated: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
};

const priorityColors: Record<string, string> = {
  critical: "text-destructive",
  high: "text-orange-500",
  medium: "text-yellow-500",
  low: "text-muted-foreground",
};

const sentimentEmoji: Record<string, string> = {
  very_negative: "😡",
  negative: "😠",
  neutral: "😐",
  positive: "😊",
};

interface DisputesTabProps {
  orgId: string;
  role: string | null;
}

const DisputesTab = ({ orgId, role }: DisputesTabProps) => {
  const { disputes, loading, createDispute, updateDispute, refetch } = useDisputes(orgId);
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [classifying, setClassifying] = useState<string | null>(null);
  const [form, setForm] = useState({
    dispute_type: "quality",
    subject: "",
    description: "",
    priority: "medium",
  });

  const canManage = role === "org_admin" || role === "manager" || role === "super_admin";

  const handleCreate = async () => {
    if (!user) return;
    const { error } = await createDispute({
      filed_by: user.id,
      dispute_type: form.dispute_type,
      subject: form.subject,
      description: form.description,
      priority: form.priority,
    });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Dispute filed" }); setOpen(false); setForm({ dispute_type: "quality", subject: "", description: "", priority: "medium" }); }
  };

  const handleStatusChange = async (id: string, status: string) => {
    const updates: any = { status };
    if (status === "resolved") {
      updates.resolved_by = user?.id;
      updates.resolved_at = new Date().toISOString();
    }
    const { error } = await updateDispute(id, updates);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else toast({ title: "Dispute updated" });
  };

  const handleClassify = async (disputeId: string) => {
    setClassifying(disputeId);
    try {
      const { data, error } = await supabase.functions.invoke("classify-dispute", {
        body: { dispute_id: disputeId },
      });
      if (error) {
        toast({ title: "Classification Failed", description: error.message, variant: "destructive" });
      } else if (data?.error) {
        toast({ title: "Classification Failed", description: data.error, variant: "destructive" });
      } else {
        const msg = data.auto_resolved
          ? "AI auto-resolved this dispute based on high confidence."
          : "AI classification complete. Review the recommendation.";
        toast({ title: "🤖 AI Classification Complete", description: msg });
        await refetch();
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setClassifying(null);
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-heading font-bold text-2xl">Disputes</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="hero" size="sm"><Plus size={14} className="mr-1" /> File Dispute</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>File a Dispute</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium">Type</label>
                <Select value={form.dispute_type} onValueChange={(v) => setForm(f => ({ ...f, dispute_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="quality">Quality Issue</SelectItem>
                    <SelectItem value="delivery">Delivery Problem</SelectItem>
                    <SelectItem value="payment">Payment Dispute</SelectItem>
                    <SelectItem value="measurement">Measurement Mismatch</SelectItem>
                    <SelectItem value="communication">Communication Issue</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium">Priority</label>
                <Select value={form.priority} onValueChange={(v) => setForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium">Subject</label>
                <Input value={form.subject} onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Brief summary" />
              </div>
              <div>
                <label className="text-xs font-medium">Description</label>
                <Textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={4} placeholder="Detailed description..." />
              </div>
              <Button variant="hero" className="w-full" onClick={handleCreate} disabled={!form.subject}>File Dispute</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {disputes.length === 0 ? (
        <div className="rounded-xl bg-card border border-border p-12 text-center">
          <Scale size={32} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No disputes filed yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {disputes.map((d) => {
            const aiClass = d.ai_classification as any;
            return (
              <div key={d.id} className="rounded-xl bg-card border border-border p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <AlertCircle size={14} className={priorityColors[d.priority]} />
                      <span className="font-medium text-sm">{d.subject}</span>
                      <Badge variant="outline" className={`text-[10px] ${statusColors[d.status] || ""}`}>
                        {d.status.replace(/_/g, " ")}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">{d.dispute_type}</Badge>
                      {d.ai_auto_resolved && (
                        <Badge variant="outline" className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          🤖 Auto-resolved
                        </Badge>
                      )}
                    </div>
                    {d.description && <p className="text-xs text-muted-foreground line-clamp-2">{d.description}</p>}

                    {/* AI Classification Results */}
                    {aiClass && (
                      <div className="mt-2 p-2.5 rounded-lg bg-primary/5 border border-primary/10 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <Bot size={12} className="text-primary" />
                          <span className="text-[11px] font-semibold text-primary">AI Analysis</span>
                          {d.ai_sentiment && (
                            <span className="text-xs">{sentimentEmoji[d.ai_sentiment] || ""}</span>
                          )}
                          {aiClass.confidence && (
                            <Badge variant="outline" className="text-[9px] ml-auto">
                              {Math.round(aiClass.confidence * 100)}% confidence
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-foreground">
                          <strong>Category:</strong> {(aiClass.category || d.category || "").replace(/_/g, " ")}
                          {aiClass.suggested_priority && (
                            <> · <strong>Suggested:</strong> {aiClass.suggested_priority}</>
                          )}
                          {aiClass.severity_score && (
                            <> · <strong>Severity:</strong> {aiClass.severity_score}/10</>
                          )}
                        </p>
                        {d.ai_recommendation && (
                          <p className="text-xs text-muted-foreground">
                            💡 {d.ai_recommendation}
                          </p>
                        )}
                        {aiClass.resolution_type && (
                          <p className="text-[10px] text-muted-foreground">
                            Recommended: <span className="font-medium">{aiClass.resolution_type.replace(/_/g, " ")}</span>
                          </p>
                        )}
                        {aiClass.reasoning && (
                          <p className="text-[10px] text-muted-foreground italic">{aiClass.reasoning}</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0 ml-4 space-y-1.5">
                    <p className="text-[10px] text-muted-foreground">{new Date(d.created_at).toLocaleDateString()}</p>

                    {/* AI Classify button */}
                    {canManage && !d.ai_classification && d.status !== "resolved" && d.status !== "closed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-[10px] h-7 w-full"
                        onClick={() => handleClassify(d.id)}
                        disabled={classifying === d.id}
                      >
                        {classifying === d.id ? (
                          <Loader2 size={11} className="mr-1 animate-spin" />
                        ) : (
                          <Bot size={11} className="mr-1" />
                        )}
                        {classifying === d.id ? "Analyzing..." : "AI Classify"}
                      </Button>
                    )}

                    {/* Status change */}
                    {canManage && d.status !== "resolved" && d.status !== "closed" && (
                      <Select value={d.status} onValueChange={(v) => handleStatusChange(d.id, v)}>
                        <SelectTrigger className="h-7 text-[10px] w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="under_review">Under Review</SelectItem>
                          <SelectItem value="mediation">Mediation</SelectItem>
                          <SelectItem value="escalated">Escalated</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};

export default DisputesTab;
