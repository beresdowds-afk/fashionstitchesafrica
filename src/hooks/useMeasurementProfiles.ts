import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface MeasurementProfile {
  id: string;
  org_id: string;
  customer_id: string;
  profile_name: string;
  measurements: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export const useMeasurementProfiles = (orgId: string | undefined, customerId?: string) => {
  const [profiles, setProfiles] = useState<MeasurementProfile[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchProfiles = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    let query = supabase
      .from("measurement_profiles")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    if (customerId) query = query.eq("customer_id", customerId);

    const { data } = await query;
    setProfiles((data as MeasurementProfile[]) || []);
    setLoading(false);
  }, [orgId, customerId]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const saveProfile = async (params: {
    org_id: string;
    customer_id: string;
    profile_name: string;
    measurements: Record<string, string>;
  }) => {
    const { error } = await supabase.from("measurement_profiles").insert({
      org_id: params.org_id,
      customer_id: params.customer_id,
      profile_name: params.profile_name,
      measurements: params.measurements as any,
    });
    if (!error) await fetchProfiles();
    return { error };
  };

  const deleteProfile = async (profileId: string) => {
    const { error } = await supabase.from("measurement_profiles").delete().eq("id", profileId);
    if (!error) await fetchProfiles();
    return { error };
  };

  return { profiles, loading, saveProfile, deleteProfile, refetch: fetchProfiles };
};
