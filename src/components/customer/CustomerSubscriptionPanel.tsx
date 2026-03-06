import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Check, Crown, Ruler, Video, Sparkles, Bell, Package, Heart,
  MessageSquare, Shield, Loader2, AlertTriangle, CheckCircle2
} from "lucide-react";
import { motion } from "framer-motion";

const INCLUDED_FEATURES = [
  { icon: Ruler, label: "AI Body Measurements", desc: "Video-based precise body measurements" },
  { icon: Sparkles, label: "Virtual Try-On", desc: "See garments on your body using AI" },
  { icon: Video, label: "Video Consultations", desc: "Live video sessions with tailors" },
  { icon: Bell, label: "Smart Notifications", desc: "Order updates via email, SMS & WhatsApp" },
  { icon: Package, label: "Priority Order Tracking", desc: "Real-time order status & delivery tracking" },
  { icon: Heart, label: "Premium Catalogue Access", desc: "Browse exclusive collections & wishlists" },
  { icon: MessageSquare, label: "Direct Messaging", desc: "Chat directly with your tailors" },
  { icon: Shield, label: "Dispute Resolution", desc: "AI-powered dispute mediation support" },
];

interface CustomerSubscriptionPanelProps {
  orgId: string;
}

export default function CustomerSubscriptionPanel({ orgId }: CustomerSubscriptionPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("customer_subscriptions" as any)
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle()
      .then(({ data }) => {
        setSubscription(data);
        setLoading(false);
      });
  }, [user]);

  const handleSubscribe = async () => {
    if (!user) return;
    setSubscribing(true);

    const periodStart = new Date().toISOString();
    const periodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from("customer_subscriptions" as any).insert({
      user_id: user.id,
      plan_name: "Premium Access",
      price_amount: 10,
      price_currency: "USD",
      billing_cycle: "yearly",
      status: "active",
      current_period_start: periodStart,
      current_period_end: periodEnd,
    } as any);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Subscribed!", description: "You now have access to all premium features." });
      // Refetch
      const { data } = await supabase
        .from("customer_subscriptions" as any)
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      setSubscription(data);
    }
    setSubscribing(false);
  };

  const isActive = !!subscription;
  const expiresAt = subscription?.current_period_end;
  const isExpiringSoon = expiresAt && new Date(expiresAt).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Subscription Status */}
      {isActive ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-secondary/30 bg-secondary/5 p-6"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-secondary/15 flex items-center justify-center">
                <Crown size={20} className="text-secondary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-heading font-bold text-lg">Premium Access</h3>
                  <Badge className="bg-secondary/15 text-secondary">
                    <CheckCircle2 size={10} className="mr-1" /> Active
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Renews {expiresAt ? new Date(expiresAt).toLocaleDateString() : "—"}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-heading font-bold text-xl">$10</p>
              <p className="text-xs text-muted-foreground">/year</p>
            </div>
          </div>
          {isExpiringSoon && (
            <div className="mt-3 flex items-center gap-2 text-xs text-accent">
              <AlertTriangle size={12} />
              <span>Subscription expiring soon — renew to maintain access.</span>
            </div>
          )}
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-secondary/5 p-8 text-center"
        >
          <Crown size={36} className="mx-auto text-primary mb-3" />
          <h3 className="font-heading font-bold text-2xl mb-1">Premium Access</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Unlock all platform features for just <span className="font-bold text-foreground">$10/year</span>
          </p>
          <Button
            variant="hero"
            size="lg"
            onClick={handleSubscribe}
            disabled={subscribing}
            className="min-w-[200px]"
          >
            {subscribing ? (
              <><Loader2 size={16} className="mr-2 animate-spin" /> Processing...</>
            ) : (
              "Subscribe — $10/year"
            )}
          </Button>
          <p className="text-[10px] text-muted-foreground mt-3">
            Free registration · Cancel anytime · All features included
          </p>
        </motion.div>
      )}

      {/* Features List */}
      <div>
        <h3 className="font-heading font-semibold text-base mb-4">
          {isActive ? "Your Included Features" : "What's Included"}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {INCLUDED_FEATURES.map((f, i) => (
            <motion.div
              key={f.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`rounded-lg border p-4 flex items-start gap-3 ${
                isActive ? "border-secondary/20 bg-card" : "border-border bg-muted/30"
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                isActive ? "bg-secondary/10" : "bg-muted"
              }`}>
                <f.icon size={16} className={isActive ? "text-secondary" : "text-muted-foreground"} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{f.label}</p>
                  {isActive && <Check size={12} className="text-secondary" />}
                </div>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
