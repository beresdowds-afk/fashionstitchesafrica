import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Payment {
  id: string;
  org_id: string;
  order_id: string;
  amount: number;
  currency: string;
  payment_type: string;
  payment_method: string | null;
  status: string;
  notes: string | null;
  paid_at: string | null;
  created_at: string;
}

export const usePayments = (orgId: string | undefined, orderId?: string) => {
  const { user } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPayments = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    let query = supabase
      .from("payments")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    if (orderId) query = query.eq("order_id", orderId);

    const { data } = await query;
    setPayments((data as Payment[]) || []);
    setLoading(false);
  }, [orgId, orderId]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const recordPayment = async (paymentData: {
    order_id: string;
    amount: number;
    currency: string;
    payment_type: string;
    payment_method?: string;
    notes?: string;
  }) => {
    if (!orgId || !user) return { error: new Error("Not authenticated") };

    const { error } = await supabase.from("payments").insert({
      org_id: orgId,
      order_id: paymentData.order_id,
      amount: paymentData.amount,
      currency: paymentData.currency,
      payment_type: paymentData.payment_type,
      payment_method: paymentData.payment_method || null,
      notes: paymentData.notes || null,
      status: "completed",
      paid_at: new Date().toISOString(),
    });

    if (!error) {
      // Update order amount_paid and payment_status
      const { data: orderPayments } = await supabase
        .from("payments")
        .select("amount")
        .eq("order_id", paymentData.order_id)
        .eq("status", "completed");

      const totalPaid = (orderPayments || []).reduce((sum, p) => sum + Number(p.amount), 0);

      const { data: order } = await supabase
        .from("orders")
        .select("total_amount, deposit_amount")
        .eq("id", paymentData.order_id)
        .single();

      const totalAmount = Number(order?.total_amount || 0);
      let paymentStatus = "unpaid";
      if (totalPaid >= totalAmount && totalAmount > 0) paymentStatus = "paid";
      else if (paymentData.payment_type === "deposit" && totalPaid > 0) paymentStatus = "deposit_paid";
      else if (totalPaid > 0) paymentStatus = "partially_paid";

      await supabase
        .from("orders")
        .update({
          amount_paid: totalPaid,
          payment_status: paymentStatus,
          deposit_amount: paymentData.payment_type === "deposit" ? paymentData.amount : undefined,
        })
        .eq("id", paymentData.order_id);

      await fetchPayments();
    }

    return { error };
  };

  return { payments, loading, recordPayment, refetch: fetchPayments };
};
