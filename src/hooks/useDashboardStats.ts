import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface DashboardStats {
  activeOrders: number;
  totalCustomers: number;
  monthlyRevenue: number;
  recentOrders: {
    id: string;
    title: string;
    status: string;
    total_amount: number;
    created_at: string;
    order_number: string;
  }[];
}

export const useDashboardStats = (orgId: string | undefined) => {
  const [stats, setStats] = useState<DashboardStats>({
    activeOrders: 0,
    totalCustomers: 0,
    monthlyRevenue: 0,
    recentOrders: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;

    const fetchStats = async () => {
      setLoading(true);

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [ordersRes, customersRes, revenueRes, recentRes] = await Promise.all([
        // Active orders (not delivered/cancelled)
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .not("status", "in", '("delivered","cancelled")'),

        // Unique customers
        supabase
          .from("orders")
          .select("customer_id")
          .eq("org_id", orgId),

        // Monthly revenue (delivered orders this month)
        supabase
          .from("orders")
          .select("total_amount")
          .eq("org_id", orgId)
          .gte("created_at", startOfMonth),

        // Recent orders
        supabase
          .from("orders")
          .select("id, title, status, total_amount, created_at, order_number")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      const uniqueCustomers = new Set(customersRes.data?.map((o) => o.customer_id) || []);
      const monthRevenue = revenueRes.data?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;

      setStats({
        activeOrders: ordersRes.count || 0,
        totalCustomers: uniqueCustomers.size,
        monthlyRevenue: monthRevenue,
        recentOrders: (recentRes.data as any[]) || [],
      });
      setLoading(false);
    };

    fetchStats();
  }, [orgId]);

  return { stats, loading };
};
