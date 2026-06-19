import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { InsuranceConfig } from "@/lib/insurance/types";

const TABLE = "insurance_config";

export function useInsuranceConfig() {
  return useQuery({
    queryKey: ["insurance-config"],
    queryFn: async (): Promise<InsuranceConfig | null> => {
      const { data, error } = await (supabase as any)
        .from(TABLE)
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as InsuranceConfig | null;
    },
    staleTime: 60_000,
  });
}

export function useUpdateInsuranceConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<InsuranceConfig>) => {
      const { data: userData } = await supabase.auth.getUser();
      const update: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
      if (userData.user?.id) update.updated_by = userData.user.id;
      const { error } = await (supabase as any).from(TABLE).update(update).eq("id", 1);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["insurance-config"] }),
  });
}