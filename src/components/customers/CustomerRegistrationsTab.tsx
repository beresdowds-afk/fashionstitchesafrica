import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, Users, XCircle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface Registration {
  id: string;
  user_id: string;
  org_id: string;
  fee_amount: number;
  fee_currency: string;
  local_amount: number | null;
  local_currency: string | null;
  status: string;
  paid_at: string | null;
  payment_gateway: string | null;
  created_at: string;
  profile?: { display_name: string | null } | null;
}

interface Props {
  orgId: string;
}

const CustomerRegistrationsTab = ({ orgId }: Props) => {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const fetchRegistrations = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("customer_registrations")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    if (data) {
      // Fetch profiles for all user_ids
      const userIds = data.map((r: any) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      setRegistrations(
        data.map((r: any) => ({ ...r, profile: profileMap.get(r.user_id) || null }))
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRegistrations();
  }, [orgId]);

  const handleWaive = async (regId: string) => {
    const { error } = await supabase
      .from("customer_registrations")
      .update({ status: "waived", paid_at: new Date().toISOString(), payment_gateway: "waived" })
      .eq("id", regId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Fee waived successfully" });
      fetchRegistrations();
    }
  };

  const handleMarkPaid = async (regId: string) => {
    const { error } = await supabase
      .from("customer_registrations")
      .update({ status: "paid", paid_at: new Date().toISOString(), payment_gateway: "manual" })
      .eq("id", regId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Marked as paid" });
      fetchRegistrations();
    }
  };

  const filtered = registrations.filter((r) => {
    if (!search.trim()) return true;
    const name = r.profile?.display_name || "";
    return name.toLowerCase().includes(search.toLowerCase());
  });

  if (loading) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-heading font-bold text-2xl">Customer Registrations</h2>
        <span className="text-sm text-muted-foreground">{registrations.length} total</span>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by name..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Users size={40} className="mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No customer registrations yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Customer</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Fee</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Gateway</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Date</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((reg) => (
                  <tr key={reg.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium">{reg.profile?.display_name || "Unknown"}</span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      ${reg.fee_amount} {reg.fee_currency}
                      {reg.local_amount && reg.local_currency && (
                        <span className="text-muted-foreground text-xs ml-1">
                          (≈{reg.local_currency} {reg.local_amount.toLocaleString()})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={reg.status === "paid" || reg.status === "waived" ? "default" : "outline"}>
                        {reg.status === "paid" && <><CheckCircle2 size={12} className="mr-1" /> Paid</>}
                        {reg.status === "waived" && <><XCircle size={12} className="mr-1" /> Waived</>}
                        {reg.status === "pending" && <><Clock size={12} className="mr-1" /> Pending</>}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground capitalize">
                      {reg.payment_gateway || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {new Date(reg.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {reg.status === "pending" && (
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="outline" onClick={() => handleMarkPaid(reg.id)}>
                            Mark Paid
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleWaive(reg.id)}>
                            Waive
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default CustomerRegistrationsTab;
