import { useState } from "react";
import { useSubscriptionPlans, useOrgSubscription } from "@/hooks/useSubscription";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Check, Crown, Zap, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AppRole } from "@/hooks/useOrganization";

const planIcons: Record<string, any> = {
  basic: Zap,
  pro: Crown,
  enterprise: Building2,
};

interface SubscriptionTabProps {
  orgId: string;
  role: AppRole | null;
}

const SubscriptionTab = ({ orgId, role }: SubscriptionTabProps) => {
  const { plans, loading: plansLoading } = useSubscriptionPlans();
  const { subscription, loading: subLoading, selectPlan } = useOrgSubscription(orgId);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [selecting, setSelecting] = useState<string | null>(null);
  const { toast } = useToast();
  const canManage = role === "org_admin" || role === "super_admin";

  const handleSelect = async (planId: string) => {
    if (!canManage) return;
    setSelecting(planId);
    const { error } = await selectPlan(planId, billingCycle);
    if (error) toast({ title: "Error", description: (error as any).message, variant: "destructive" });
    else toast({ title: "Plan updated successfully" });
    setSelecting(null);
  };

  if (plansLoading || subLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-heading font-bold text-2xl">Subscription Plan</h2>
          {subscription?.plan && (
            <p className="text-sm text-muted-foreground mt-1">
              Current plan: <span className="font-medium text-foreground">{subscription.plan.name}</span>
              {" · "}{subscription.billing_cycle === "yearly" ? "Annual" : "Monthly"} billing
              {" · "}Status: <span className="font-medium text-secondary">{subscription.status}</span>
            </p>
          )}
          {!subscription && (
            <p className="text-sm text-muted-foreground mt-1">No active plan. Choose a plan below.</p>
          )}
        </div>
      </div>

      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3 mb-8">
        <button
          onClick={() => setBillingCycle("monthly")}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            billingCycle === "monthly" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => setBillingCycle("yearly")}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            billingCycle === "yearly" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          Yearly <span className="text-xs opacity-75">Save 15%+</span>
        </button>
      </div>

      {/* Plans grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((plan, i) => {
          const Icon = planIcons[plan.slug] || Zap;
          const isCurrentPlan = subscription?.plan_id === plan.id;
          const price = billingCycle === "yearly" ? plan.price_yearly : plan.price_monthly;
          const isPro = plan.slug === "pro";

          return (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`relative rounded-xl border p-6 flex flex-col ${
                isPro
                  ? "border-primary bg-primary/5 shadow-gold"
                  : "border-border bg-card"
              }`}
            >
              {isPro && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                  Most Popular
                </div>
              )}

              <div className="flex items-center gap-2 mb-3">
                <Icon size={20} className={isPro ? "text-primary" : "text-muted-foreground"} />
                <h3 className="font-heading font-bold text-lg">{plan.name}</h3>
              </div>

              {plan.description && (
                <p className="text-xs text-muted-foreground mb-4">{plan.description}</p>
              )}

              <div className="mb-4">
                <span className="font-heading font-bold text-3xl">
                  ₦{price.toLocaleString()}
                </span>
                <span className="text-sm text-muted-foreground">
                  /{billingCycle === "yearly" ? "yr" : "mo"}
                </span>
              </div>

              {/* Limits */}
              <div className="space-y-2 mb-4 text-sm">
                <div className="flex items-center gap-2">
                  <Check size={14} className="text-secondary shrink-0" />
                  <span>{plan.max_orders ? `${plan.max_orders} orders/mo` : "Unlimited orders"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check size={14} className="text-secondary shrink-0" />
                  <span>{plan.max_customers ? `${plan.max_customers} customers` : "Unlimited customers"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check size={14} className="text-secondary shrink-0" />
                  <span>{plan.max_members ? `${plan.max_members} team members` : "Unlimited members"}</span>
                </div>
              </div>

              {/* Features */}
              {plan.features.length > 0 && (
                <div className="space-y-1.5 mb-6 flex-1">
                  {plan.features.map((feature, fi) => (
                    <div key={fi} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Check size={12} className="text-secondary shrink-0 mt-0.5" />
                      <span>{String(feature)}</span>
                    </div>
                  ))}
                </div>
              )}

              <Button
                variant={isCurrentPlan ? "outline" : isPro ? "hero" : "default"}
                className="w-full mt-auto"
                disabled={isCurrentPlan || !canManage || selecting !== null}
                onClick={() => handleSelect(plan.id)}
              >
                {selecting === plan.id
                  ? "Selecting..."
                  : isCurrentPlan
                  ? "Current Plan"
                  : "Select Plan"}
              </Button>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default SubscriptionTab;
