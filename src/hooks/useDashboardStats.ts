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
  statusDistribution: { status: string; count: number }[];
  monthlyRevenueTrend: { month: string; revenue: number }[];
}

export const useDashboardStats = (orgId: string | undefined) => {
  const [stats, setStats] = useState<DashboardStats>({
    activeOrders: 0,
    totalCustomers: 0,
    monthlyRevenue: 0,
    recentOrders: [],
    statusDistribution: [],
    monthlyRevenueTrend: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;

    const fetchStats = async () => {
      setLoading(true);

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      // Last 6 months for trend
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();

      const [ordersRes, customersRes, revenueRes, recentRes, allOrdersRes] = await Promise.all([
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .not("status", "in", '("delivered","cancelled")'),
        supabase
          .from("orders")
          .select("customer_id")
          .eq("org_id", orgId),
        supabase
          .from("orders")
          .select("total_amount")
          .eq("org_id", orgId)
          .gte("created_at", startOfMonth),
        supabase
          .from("orders")
          .select("id, title, status, total_amount, created_at, order_number")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false })
          .limit(5),
        // All orders for charts
        supabase
          .from("orders")
          .select("status, total_amount, created_at")
          .eq("org_id", orgId)
          .gte("created_at", sixMonthsAgo),
      ]);

      const uniqueCustomers = new Set(customersRes.data?.map((o) => o.customer_id) || []);
      const monthRevenue = revenueRes.data?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;

      // Status distribution
      const statusMap = new Map<string, number>();
      allOrdersRes.data?.forEach((o: any) => {
        statusMap.set(o.status, (statusMap.get(o.status) || 0) + 1);
      });
      const statusDistribution = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }));

      // Monthly revenue trend (last 6 months)
      const monthlyMap = new Map<string, number>();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        monthlyMap.set(key, 0);
      }
      allOrdersRes.data?.forEach((o: any) => {
        const d = new Date(o.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (monthlyMap.has(key)) {
          monthlyMap.set(key, (monthlyMap.get(key) || 0) + (o.total_amount || 0));
        }
      });
      const monthlyRevenueTrend = Array.from(monthlyMap.entries()).map(([month, revenue]) => ({
        month: new Date(month + "-01").toLocaleDateString("en", { month: "short" }),
        revenue,
      }));

      setStats({
        activeOrders: ordersRes.count || 0,
        totalCustomers: uniqueCustomers.size,
        monthlyRevenue: monthRevenue,
        recentOrders: (recentRes.data as any[]) || [],
        statusDistribution,
        monthlyRevenueTrend,
      });
      setLoading(false);
    };

    fetchStats();
  }, [orgId]);

  return { stats, loading };
};
