import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Coins, Crown, ArrowRight, Receipt } from "lucide-react";

interface PaymentWidgetProps {
  variant?: "compact" | "full";
}

const PaymentWidget = ({ variant = "compact" }: PaymentWidgetProps) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    tokenBalance: 0,
    recentPayments: 0,
    hasSubscription: false,
    planName: "Free",
  });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [{ data: wallet }, { count: paymentCount }, { data: sub }] = await Promise.all([
        supabase.from("credit_wallets").select("balance").eq("owner_id", user.id).eq("owner_type", "user").maybeSingle(),
        supabase.from("payments").select("*", { count: "exact", head: true }).eq("status", "completed"),
        supabase.from("customer_subscriptions").select("plan_name").eq("user_id", user.id).eq("status", "active").maybeSingle(),
      ]);
      setStats({
        tokenBalance: wallet?.balance ?? 0,
        recentPayments: paymentCount || 0,
        hasSubscription: !!sub,
        planName: sub?.plan_name || "Free",
      });
    };
    load();
  }, [user]);

  if (variant === "compact") {
    return (
      <Card className="p-4 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => navigate("/payments")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <CreditCard size={18} className="text-primary" />
            </div>
            <div>
              <p className="font-heading font-semibold text-sm">Payments & Billing</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{stats.tokenBalance} tokens</span>
                <span>·</span>
                <span className="capitalize">{stats.planName}</span>
              </div>
            </div>
          </div>
          <ArrowRight size={16} className="text-muted-foreground" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold flex items-center gap-2">
          <CreditCard size={18} className="text-primary" /> Payments & Billing
        </h3>
        <Button variant="outline" size="sm" onClick={() => navigate("/payments")}>
          View All <ArrowRight size={14} className="ml-1" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-muted/30 text-center">
          <Coins size={16} className="text-chart-4 mx-auto mb-1" />
          <p className="font-heading font-bold">{stats.tokenBalance}</p>
          <p className="text-[10px] text-muted-foreground">Tokens</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/30 text-center">
          <Receipt size={16} className="text-secondary mx-auto mb-1" />
          <p className="font-heading font-bold">{stats.recentPayments}</p>
          <p className="text-[10px] text-muted-foreground">Payments</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/30 text-center">
          <Crown size={16} className="text-primary mx-auto mb-1" />
          <p className="font-heading font-bold capitalize text-sm">{stats.planName}</p>
          <p className="text-[10px] text-muted-foreground">Plan</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="hero" size="sm" className="flex-1" onClick={() => navigate("/payments?tab=tokens")}>
          <Coins size={14} className="mr-1" /> Buy Tokens
        </Button>
        <Button variant="outline" size="sm" className="flex-1" onClick={() => navigate("/payments?tab=history")}>
          <Receipt size={14} className="mr-1" /> History
        </Button>
      </div>
    </Card>
  );
};

export default PaymentWidget;
