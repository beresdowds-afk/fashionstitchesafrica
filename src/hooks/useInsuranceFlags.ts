import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { InsuranceFlag, InsuranceFlagKey } from "@/lib/insurance/types";

const TABLE = "insurance_feature_flags";

export function useInsuranceFlags() {
  return useQuery({
    queryKey: ["insurance-flags"],
    queryFn: async (): Promise<InsuranceFlag[]> => {
      const { data, error } = await (supabase as any)
        .from(TABLE)
        .select("*")
        .order("phase");
      if (error) throw error;
      return (data ?? []) as InsuranceFlag[];
    },
    staleTime: 60_000,
  });
}

export function useInsuranceFlag(key: InsuranceFlagKey) {
  const q = useInsuranceFlags();
  return {
    ...q,
    flag: q.data?.find((f) => f.flag_key === key) ?? null,
    enabled: !!q.data?.find((f) => f.flag_key === key)?.enabled,
  };
}

export function useUpdateInsuranceFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      id: string;
      enabled?: boolean;
      configuration?: Record<string, unknown>;
    }) => {
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (args.enabled !== undefined) update.enabled = args.enabled;
      if (args.configuration !== undefined) update.configuration = args.configuration;
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user?.id) update.updated_by = userData.user.id;
      const { error } = await (supabase as any).from(TABLE).update(update).eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["insurance-flags"] }),
  });
}