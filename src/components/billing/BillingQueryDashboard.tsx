import { useState, useEffect } from "react";
import { useBillingQueries } from "@/hooks/useBillingQueries";
import { useOrgSubscription } from "@/hooks/useSubscription";
import { usePayments } from "@/hooks/usePayments";
import { useContractPayments } from "@/hooks/useTailorContracts";
import { useCreditWallet } from "@/hooks/useCreditWallet";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import {
  Search, Plus, DollarSign, CreditCard, Receipt,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  Clock, FileText, Wallet, ArrowUpRight, ArrowDownLeft,
  BarChart3, Filter,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/hooks/useOrganization";

interface BillingQueryDashboardProps {
  orgId: string;
  role: AppRole | null;
  currency?: string;
}

const BillingQueryDashboard = ({ orgId, role, currency = "NGN" }: BillingQueryDashboardProps) => {
  const { queries, loading: queriesLoading, createQuery, resolveQuery } = useBillingQueries(orgId);
  const { subscription } = useOrgSubscription(orgId);
  const { payments } = usePayments(orgId);
  const { payments: contractPayments } = useContractPayments(orgId);
  const { wallet } = useCreditWallet(orgId);
  const { toast } = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [showResolve, setShowResolve] = useState<string | null>(null);
  const [resolveNotes, setResolveNotes] = useState("");
  const [filter, setFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Fee ledger data
  const [feeLedger, setFeeLedger] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("platform_fee_ledger").select("*").eq("org_id", orgId)
      .order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => setFeeLedger(data || []));
  }, [orgId]);

  const [form, setForm] = useState({
    query_type: "general",
    subject: "",
    description: "",
    category: "billing",
    priority: "normal",
  });

  const handleCreate = async () => {
    if (!form.subject.trim()) { toast({ title: "Subject required", variant: "destructive" }); return; }
    const { error } = await createQuery(form);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Query submitted" }); setShowCreate(false); setForm({ query_type: "general", subject: "", description: "", category: "billing", priority: "normal" }); }
  };

  const handleResolve = async () => {
    if (!showResolve) return;
    await resolveQuery(showResolve, resolveNotes);
    toast({ title: "Query resolved" });
    setShowResolve(null);
    setResolveNotes("");
  };

  // Compute billing stats
  const totalOrderPayments = payments.filter(p => p.status === "completed").reduce((s, p) => s + Number(p.amount), 0);
  const totalContractPayouts = contractPayments.reduce((s, p) => s + p.tailor_payout_amount, 0);
  const totalAgencyFees = contractPayments.reduce((s, p) => s + p.agency_fee_amount, 0);
  const totalPlatformFees = feeLedger.filter(f => f.fee_type === "customer_surcharge").reduce((s, f) => s + Number(f.amount), 0);
  const totalAdminFees = feeLedger.filter(f => f.fee_type === "org_admin_fee").reduce((s, f) => s + Number(f.amount), 0);
  const creditBalance = wallet?.balance || 0;

  const filteredQueries = queries
    .filter(q => filter === "all" || q.status === filter)
    .filter(q => !searchTerm || q.subject.toLowerCase().includes(searchTerm.toLowerCase()));

  const isAdmin = role === "org_admin" || role === "manager" || role === "super_admin";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Unified Billing Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Order Revenue", value: totalOrderPayments, icon: TrendingUp, color: "text-green-600" },
          { label: "Platform Fees", value: totalPlatformFees, icon: ArrowUpRight, color: "text-secondary" },
          { label: "Admin Fees", value: totalAdminFees, icon: ArrowDownLeft, color: "text-accent" },
          { label: "Tailor Payouts", value: totalContractPayouts, icon: DollarSign, color: "text-primary" },
          { label: "Agency Fees", value: totalAgencyFees, icon: Receipt, color: "text-secondary" },
          { label: "Credit Balance", value: creditBalance, icon: Wallet, color: "text-primary" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-1.5 mb-1">
                <s.icon size={14} className={s.color} />
                <span className="text-[10px] text-muted-foreground truncate">{s.label}</span>
              </div>
              <p className="font-heading font-bold text-sm">
                {typeof s.value === "number" ? `${currency} ${s.value.toLocaleString()}` : s.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Subscription Status */}
      {subscription && (
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CreditCard size={18} className="text-primary" />
                <div>
                  <p className="text-sm font-medium">
                    {subscription.plan?.name || "Plan"} · {subscription.billing_cycle} billing
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Status: <span className="text-secondary font-medium">{subscription.status}</span>
                    {" · "}Period: {new Date(subscription.current_period_start).toLocaleDateString()} – {new Date(subscription.current_period_end).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <Badge variant="secondary">{subscription.plan?.name}</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Billing Queries Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg"><FileText size={18} /> Billing Queries</CardTitle>
              <CardDescription>Submit and track billing inquiries for subscriptions, payments, and fees.</CardDescription>
            </div>
            <Dialog open={showCreate} onOpenChange={setShowCreate}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus size={14} className="mr-1" /> New Query</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Submit Billing Query</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Category</Label>
                    <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="billing">General Billing</SelectItem>
                        <SelectItem value="subscription">Subscription</SelectItem>
                        <SelectItem value="payment">Payment Issue</SelectItem>
                        <SelectItem value="refund">Refund Request</SelectItem>
                        <SelectItem value="credits">Credits & Wallet</SelectItem>
                        <SelectItem value="fees">Platform Fees</SelectItem>
                        <SelectItem value="contract_payment">Contract Payment</SelectItem>
                        <SelectItem value="invoice">Invoice Issue</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Priority</Label>
                    <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Subject</Label>
                    <Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Brief summary of your query" />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Provide details..." rows={4} />
                  </div>
                  <Button onClick={handleCreate} className="w-full">Submit Query</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search queries..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-32 h-9">
                <Filter size={12} className="mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Query stats */}
          <div className="flex gap-4 mb-4 text-xs text-muted-foreground">
            <span>Total: {queries.length}</span>
            <span>Open: {queries.filter(q => q.status === "open").length}</span>
            <span>Resolved: {queries.filter(q => q.status === "resolved").length}</span>
          </div>

          {/* Query List */}
          {filteredQueries.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">
              {queries.length === 0 ? "No billing queries yet." : "No queries match your filter."}
            </p>
          ) : (
            <div className="space-y-2">
              {filteredQueries.map(q => (
                <div key={q.id} className="flex items-start justify-between p-3 border border-border rounded-lg">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{q.subject}</span>
                      <Badge variant={q.status === "open" ? "default" : q.status === "resolved" ? "secondary" : "outline"} className="text-[10px]">
                        {q.status}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">{q.category}</Badge>
                      {q.priority === "urgent" && <Badge variant="destructive" className="text-[10px]">Urgent</Badge>}
                      {q.priority === "high" && <Badge className="bg-accent/15 text-accent-foreground text-[10px]">High</Badge>}
                    </div>
                    {q.description && <p className="text-xs text-muted-foreground line-clamp-2">{q.description}</p>}
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock size={10} /> {new Date(q.created_at).toLocaleDateString()}
                      {q.resolved_at && <span className="ml-2">· Resolved: {new Date(q.resolved_at).toLocaleDateString()}</span>}
                    </p>
                    {q.resolution_notes && (
                      <div className="mt-1 p-2 bg-muted rounded text-xs">
                        <span className="font-medium">Resolution:</span> {q.resolution_notes}
                      </div>
                    )}
                  </div>
                  {isAdmin && q.status !== "resolved" && q.status !== "closed" && (
                    <Button size="sm" variant="outline" className="ml-2 shrink-0" onClick={() => setShowResolve(q.id)}>
                      <CheckCircle size={12} className="mr-1" /> Resolve
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resolve Dialog */}
      <Dialog open={!!showResolve} onOpenChange={() => { setShowResolve(null); setResolveNotes(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resolve Billing Query</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Resolution Notes</Label>
              <Textarea value={resolveNotes} onChange={e => setResolveNotes(e.target.value)} placeholder="Explain how this was resolved..." rows={4} />
            </div>
            <Button onClick={handleResolve} disabled={!resolveNotes.trim()} className="w-full">Mark as Resolved</Button>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

export default BillingQueryDashboard;
