import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import {
  Building2, Plus, Pencil, Trash2, CheckCircle2, XCircle, Clock,
  Banknote, Shield, Search, Loader2, Star
} from "lucide-react";

interface BankAccount {
  id: string;
  bank_name: string;
  bank_code: string | null;
  account_number: string;
  account_name: string;
  sort_code: string | null;
  bank_type: string;
  provider_slug: string;
  is_active: boolean;
  is_primary: boolean;
  currency: string;
  notes: string | null;
  created_at: string;
}

interface BankTransfer {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  purpose: string;
  transfer_reference: string | null;
  bank_name: string | null;
  account_name: string | null;
  status: string;
  auto_verified: boolean;
  verification_method: string;
  notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  verified_at: string | null;
  verified_by: string | null;
}

const BANK_PRESETS = [
  { slug: "stanbic-ibtc", name: "Stanbic IBTC Bank", code: "221", type: "commercial" },
  { slug: "access-bank", name: "Access Bank", code: "044", type: "commercial" },
  { slug: "moniepoint", name: "Moniepoint MFB", code: "50515", type: "fintech" },
  { slug: "opay", name: "OPay", code: "999992", type: "fintech" },
  { slug: "first-bank", name: "First Bank of Nigeria", code: "011", type: "commercial" },
  { slug: "carbon", name: "Carbon (Pay Later)", code: "", type: "bnpl" },
];

const BankAccountsPanel = () => {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transfers, setTransfers] = useState<BankTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("accounts");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Form state
  const [formData, setFormData] = useState({
    bank_name: "", bank_code: "", account_number: "", account_name: "",
    sort_code: "", bank_type: "commercial", provider_slug: "", currency: "NGN", notes: "",
  });

  const fetchAccounts = useCallback(async () => {
    const { data } = await supabase
      .from("platform_bank_accounts")
      .select("*")
      .order("is_primary", { ascending: false })
      .order("bank_name");
    setAccounts((data as unknown as BankAccount[]) || []);
  }, []);

  const fetchTransfers = useCallback(async () => {
    let query = supabase
      .from("bank_transfer_payments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (statusFilter !== "all") query = query.eq("status", statusFilter);

    const { data } = await query;
    setTransfers((data as unknown as BankTransfer[]) || []);
  }, [statusFilter]);

  useEffect(() => {
    Promise.all([fetchAccounts(), fetchTransfers()]).then(() => setLoading(false));
  }, [fetchAccounts, fetchTransfers]);

  const resetForm = () => {
    setFormData({
      bank_name: "", bank_code: "", account_number: "", account_name: "",
      sort_code: "", bank_type: "commercial", provider_slug: "", currency: "NGN", notes: "",
    });
    setEditingAccount(null);
  };

  const applyPreset = (slug: string) => {
    const preset = BANK_PRESETS.find(b => b.slug === slug);
    if (preset) {
      setFormData(prev => ({
        ...prev,
        bank_name: preset.name,
        bank_code: preset.code,
        bank_type: preset.type,
        provider_slug: preset.slug,
      }));
    }
  };

  const handleSaveAccount = async () => {
    if (!formData.bank_name || !formData.account_number || !formData.account_name) {
      toast({ title: "Fill required fields", variant: "destructive" });
      return;
    }

    const payload = {
      bank_name: formData.bank_name,
      bank_code: formData.bank_code || null,
      account_number: formData.account_number,
      account_name: formData.account_name,
      sort_code: formData.sort_code || null,
      bank_type: formData.bank_type,
      provider_slug: formData.provider_slug || formData.bank_name.toLowerCase().replace(/\s+/g, "-"),
      currency: formData.currency,
      notes: formData.notes || null,
    };

    let error;
    if (editingAccount) {
      ({ error } = await supabase.from("platform_bank_accounts").update(payload).eq("id", editingAccount.id));
    } else {
      ({ error } = await supabase.from("platform_bank_accounts").insert(payload));
    }

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingAccount ? "Account updated" : "Account added" });
      setDialogOpen(false);
      resetForm();
      fetchAccounts();
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    await supabase.from("platform_bank_accounts").update({ is_active: active }).eq("id", id);
    fetchAccounts();
  };

  const setPrimary = async (id: string) => {
    // Remove primary from all, then set this one
    await supabase.from("platform_bank_accounts").update({ is_primary: false }).neq("id", "none");
    await supabase.from("platform_bank_accounts").update({ is_primary: true }).eq("id", id);
    fetchAccounts();
    toast({ title: "Primary account updated" });
  };

  const deleteAccount = async (id: string) => {
    await supabase.from("platform_bank_accounts").delete().eq("id", id);
    fetchAccounts();
    toast({ title: "Account removed" });
  };

  const verifyTransfer = async (transferId: string, action: "verify" | "reject", reason?: string) => {
    const updates: any = {
      status: action === "verify" ? "verified" : "rejected",
      verified_at: new Date().toISOString(),
      verification_method: "manual",
    };
    if (action === "reject" && reason) updates.rejection_reason = reason;

    const { error } = await supabase
      .from("bank_transfer_payments")
      .update(updates)
      .eq("id", transferId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: action === "verify" ? "Transfer verified" : "Transfer rejected" });
      fetchTransfers();
    }
  };

  const autoVerifyTransfer = async (transferId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("auto-verify-transfer", {
        body: { transfer_id: transferId },
      });
      if (error) throw error;
      toast({ title: "Auto-verification", description: data?.message || "Processed" });
      fetchTransfers();
    } catch (err: any) {
      toast({ title: "Auto-verify failed", description: err.message, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const filteredTransfers = transfers.filter(t => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.transfer_reference?.toLowerCase().includes(q) ||
      t.purpose.toLowerCase().includes(q) ||
      String(t.amount).includes(q)
    );
  });

  const pendingCount = transfers.filter(t => t.status === "pending").length;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading font-bold text-2xl">Bank Accounts & Transfers</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage platform bank accounts and verify customer bank transfers.
          </p>
        </div>
        {pendingCount > 0 && (
          <Badge variant="destructive" className="text-sm px-3 py-1">
            {pendingCount} pending verification{pendingCount > 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="accounts">
            <Building2 size={14} className="mr-1" /> Bank Accounts
          </TabsTrigger>
          <TabsTrigger value="transfers">
            <Banknote size={14} className="mr-1" /> Transfer Verification
            {pendingCount > 0 && (
              <span className="ml-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Bank Accounts Tab ── */}
        <TabsContent value="accounts" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button variant="hero" size="sm">
                  <Plus size={14} className="mr-1" /> Add Bank Account
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingAccount ? "Edit" : "Add"} Bank Account</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Preset selector */}
                  <div>
                    <label className="text-sm font-medium mb-1 block">Quick Select Bank</label>
                    <Select onValueChange={applyPreset}>
                      <SelectTrigger><SelectValue placeholder="Choose a preset..." /></SelectTrigger>
                      <SelectContent>
                        {BANK_PRESETS.map(b => (
                          <SelectItem key={b.slug} value={b.slug}>{b.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium mb-1 block">Bank Name *</label>
                      <Input value={formData.bank_name} onChange={e => setFormData(p => ({ ...p, bank_name: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Bank Code</label>
                      <Input value={formData.bank_code} onChange={e => setFormData(p => ({ ...p, bank_code: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Account Number *</label>
                    <Input value={formData.account_number} onChange={e => setFormData(p => ({ ...p, account_number: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Account Name *</label>
                    <Input value={formData.account_name} onChange={e => setFormData(p => ({ ...p, account_name: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium mb-1 block">Type</label>
                      <Select value={formData.bank_type} onValueChange={v => setFormData(p => ({ ...p, bank_type: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="commercial">Commercial Bank</SelectItem>
                          <SelectItem value="fintech">Fintech</SelectItem>
                          <SelectItem value="bnpl">BNPL / Pay Later</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1 block">Sort Code</label>
                      <Input value={formData.sort_code} onChange={e => setFormData(p => ({ ...p, sort_code: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Notes</label>
                    <Textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} rows={2} />
                  </div>
                  <Button variant="hero" className="w-full" onClick={handleSaveAccount}>
                    {editingAccount ? "Update Account" : "Add Account"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-4">
            {accounts.map(acc => (
              <Card key={acc.id} className={`p-4 ${acc.is_primary ? "border-primary/30 bg-primary/5" : ""}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      acc.bank_type === "fintech" ? "bg-chart-4/10" :
                      acc.bank_type === "bnpl" ? "bg-chart-5/10" : "bg-primary/10"
                    }`}>
                      <Building2 size={18} className={
                        acc.bank_type === "fintech" ? "text-chart-4" :
                        acc.bank_type === "bnpl" ? "text-chart-5" : "text-primary"
                      } />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-heading font-semibold">{acc.bank_name}</p>
                        {acc.is_primary && (
                          <Badge className="bg-primary/10 text-primary text-[10px]">
                            <Star size={10} className="mr-0.5" /> Primary
                          </Badge>
                        )}
                        <Badge variant={acc.is_active ? "default" : "secondary"} className="text-[10px]">
                          {acc.is_active ? "Active" : "Inactive"}
                        </Badge>
                        <Badge variant="outline" className="capitalize text-[10px]">{acc.bank_type}</Badge>
                      </div>
                      <p className="text-sm font-mono mt-1">{acc.account_number || "No account number set"}</p>
                      <p className="text-xs text-muted-foreground">{acc.account_name} · {acc.currency}</p>
                      {acc.bank_code && <p className="text-xs text-muted-foreground mt-0.5">Code: {acc.bank_code}</p>}
                      {acc.notes && <p className="text-xs text-muted-foreground mt-1 italic">{acc.notes}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={acc.is_active} onCheckedChange={(checked) => toggleActive(acc.id, checked)} />
                    {!acc.is_primary && (
                      <Button variant="ghost" size="sm" onClick={() => setPrimary(acc.id)} title="Set as primary">
                        <Star size={14} />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => {
                      setEditingAccount(acc);
                      setFormData({
                        bank_name: acc.bank_name,
                        bank_code: acc.bank_code || "",
                        account_number: acc.account_number,
                        account_name: acc.account_name,
                        sort_code: acc.sort_code || "",
                        bank_type: acc.bank_type,
                        provider_slug: acc.provider_slug,
                        currency: acc.currency,
                        notes: acc.notes || "",
                      });
                      setDialogOpen(true);
                    }}>
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteAccount(acc.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
            {accounts.length === 0 && (
              <Card className="p-12 text-center">
                <Building2 size={36} className="mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No bank accounts configured yet.</p>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ── Transfer Verification Tab ── */}
        <TabsContent value="transfers" className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by reference, purpose, or amount..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Amount</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransfers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                      No transfers found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTransfers.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono font-medium">
                        {t.currency} {Number(t.amount).toLocaleString()}
                      </TableCell>
                      <TableCell className="capitalize text-sm">{t.purpose.replace(/_/g, " ")}</TableCell>
                      <TableCell className="font-mono text-xs">{t.transfer_reference || "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={t.status === "verified" ? "default" : t.status === "rejected" ? "destructive" : "secondary"}
                          className="capitalize text-xs"
                        >
                          {t.status === "verified" && <CheckCircle2 size={10} className="mr-1" />}
                          {t.status === "rejected" && <XCircle size={10} className="mr-1" />}
                          {t.status === "pending" && <Clock size={10} className="mr-1" />}
                          {t.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs capitalize">{t.verification_method || "manual"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {t.status === "pending" && (
                          <div className="flex items-center gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-primary text-xs"
                              onClick={() => autoVerifyTransfer(t.id)}
                              title="Auto-verify"
                            >
                              <Shield size={12} className="mr-1" /> Auto
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-primary text-xs"
                              onClick={() => verifyTransfer(t.id, "verify")}
                            >
                              <CheckCircle2 size={12} className="mr-1" /> Verify
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive text-xs"
                              onClick={() => verifyTransfer(t.id, "reject", "Payment not found")}
                            >
                              <XCircle size={12} className="mr-1" /> Reject
                            </Button>
                          </div>
                        )}
                        {t.status !== "pending" && (
                          <span className="text-xs text-muted-foreground">
                            {t.verified_at ? new Date(t.verified_at).toLocaleDateString() : "—"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
};

export default BankAccountsPanel;
