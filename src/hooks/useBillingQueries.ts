import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface BillingQuery {
  id: string;
  org_id: string | null;
  user_id: string;
  query_type: string;
  subject: string;
  description: string | null;
  status: string;
  priority: string;
  category: string;
  related_order_id: string | null;
  related_payment_id: string | null;
  related_subscription_id: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

export const useBillingQueries = (orgId: string | undefined) => {
  const { user } = useAuth();
  const [queries, setQueries] = useState<BillingQuery[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchQueries = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data } = await supabase
      .from("billing_queries")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    setQueries((data as BillingQuery[]) || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { fetchQueries(); }, [fetchQueries]);

  const createQuery = async (queryData: {
    query_type: string;
    subject: string;
    description?: string;
    category?: string;
    priority?: string;
    related_order_id?: string;
    related_payment_id?: string;
    related_subscription_id?: string;
  }) => {
    if (!orgId || !user) return { error: new Error("Not authenticated") };
    const { error } = await supabase.from("billing_queries").insert({
      org_id: orgId,
      user_id: user.id,
      ...queryData,
    } as any);
    if (!error) await fetchQueries();
    return { error };
  };

  const updateQuery = async (id: string, updates: Partial<BillingQuery>) => {
    const { error } = await supabase
      .from("billing_queries")
      .update(updates as any)
      .eq("id", id);
    if (!error) await fetchQueries();
    return { error };
  };

  const resolveQuery = async (id: string, notes: string) => {
    if (!user) return { error: new Error("Not authenticated") };
    const { error } = await supabase
      .from("billing_queries")
      .update({
        status: "resolved",
        resolution_notes: notes,
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
      } as any)
      .eq("id", id);
    if (!error) await fetchQueries();
    return { error };
  };

  return { queries, loading, createQuery, updateQuery, resolveQuery, refetch: fetchQueries };
};
