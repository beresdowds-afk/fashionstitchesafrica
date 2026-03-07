import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OrgExemption {
  id: string;
  org_id: string;
  exemption_type: string;
  reason: string | null;
  granted_by: string | null;
  is_active: boolean;
  expires_at: string | null;
}

export const useOrgExemptions = (orgId: string | undefined) => {
  const [exemptions, setExemptions] = useState<OrgExemption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) { setLoading(false); return; }
    const fetch = async () => {
      const { data } = await supabase
        .from("org_fee_exemptions")
        .select("*")
        .eq("org_id", orgId)
        .eq("is_active", true);
      setExemptions((data as OrgExemption[]) || []);
      setLoading(false);
    };
    fetch();
  }, [orgId]);

  const isExempt = (type: string) =>
    exemptions.some(
      (e) =>
        e.exemption_type === type &&
        e.is_active &&
        (!e.expires_at || new Date(e.expires_at) > new Date())
    );

  return { exemptions, loading, isExempt };
};
