import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PremiumUsageRecord {
  id: string;
  org_id: string;
  user_id: string;
  feature_type: string;
  session_id: string | null;
  credits_used: number;
  unit_price: number;
  currency: string;
  is_included: boolean;
  billed_to: string;
  status: string;
  metadata: any;
  created_at: string;
}

export interface VirtualTryonSession {
  id: string;
  org_id: string;
  customer_id: string;
  input_image_url: string | null;
  garment_description: string | null;
  result_image_url: string | null;
  measurement_profile_id: string | null;
  status: string;
  error_message: string | null;
  metadata: any;
  created_at: string;
  updated_at: string;
}

export const usePremiumUsage = (orgId: string | undefined) => {
  const [usage, setUsage] = useState<PremiumUsageRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchUsage = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data } = await supabase
      .from("premium_feature_usage")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100);
    setUsage((data as PremiumUsageRecord[]) || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { fetchUsage(); }, [fetchUsage]);

  const summary = {
    ai_measurements: usage.filter(u => u.feature_type === "ai_measurement").length,
    virtual_tryons: usage.filter(u => u.feature_type === "virtual_tryon").length,
    video_calls: usage.filter(u => u.feature_type === "video_call").length,
    totalSpent: usage.reduce((sum, u) => sum + (u.is_included ? 0 : u.unit_price * u.credits_used), 0),
  };

  return { usage, loading, summary, refetch: fetchUsage };
};

export const useVirtualTryonSessions = (orgId: string | undefined) => {
  const [sessions, setSessions] = useState<VirtualTryonSession[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data } = await supabase
      .from("virtual_tryon_sessions")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50);
    setSessions((data as VirtualTryonSession[]) || []);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const createSession = async (params: {
    org_id: string;
    customer_id: string;
    garment_description: string;
    input_image_url?: string;
    measurement_profile_id?: string;
  }) => {
    const { data, error } = await supabase
      .from("virtual_tryon_sessions")
      .insert(params)
      .select()
      .single();
    if (!error) await fetchSessions();
    return { data: data as VirtualTryonSession | null, error };
  };

  return { sessions, loading, createSession, refetch: fetchSessions };
};
