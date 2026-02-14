import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  features: any[];
  max_members: number | null;
  max_orders: number | null;
  max_customers: number | null;
  sort_order: number;
  is_active: boolean;
}

export interface OrgSubscription {
  id: string;
  org_id: string;
  plan_id: string;
  status: string;
  billing_cycle: string;
  current_period_start: string;
  current_period_end: string;
  plan?: SubscriptionPlan;
}

export const useSubscriptionPlans = () => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      setPlans(
        (data || []).map((p: any) => ({
          ...p,
          features: Array.isArray(p.features) ? p.features : [],
        }))
      );
      setLoading(false);
    };
    fetch();
  }, []);

  return { plans, loading };
};

export const useOrgSubscription = (orgId: string | undefined) => {
  const [subscription, setSubscription] = useState<OrgSubscription | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSubscription = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    setLoading(true);

    const { data } = await supabase
      .from("org_subscriptions")
      .select("*")
      .eq("org_id", orgId)
      .single();

    if (data) {
      const { data: plan } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("id", data.plan_id)
        .single();

      setSubscription({
        ...data,
        plan: plan
          ? { ...plan, features: Array.isArray(plan.features) ? plan.features : [] }
          : undefined,
      });
    } else {
      setSubscription(null);
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const selectPlan = async (planId: string, billingCycle: "monthly" | "yearly" = "monthly") => {
    if (!orgId) return { error: new Error("No org") };

    if (subscription) {
      const { error } = await supabase
        .from("org_subscriptions")
        .update({ plan_id: planId, billing_cycle: billingCycle })
        .eq("id", subscription.id);
      if (!error) await fetchSubscription();
      return { error };
    } else {
      const { error } = await supabase
        .from("org_subscriptions")
        .insert({ org_id: orgId, plan_id: planId, billing_cycle: billingCycle });
      if (!error) await fetchSubscription();
      return { error };
    }
  };

  return { subscription, loading, selectPlan, refetch: fetchSubscription };
};
