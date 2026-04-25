import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSentinelMcp } from "./useSentinelMcp";

export interface SeoRequest {
  id: string;
  requester_id: string;
  org_id: string | null;
  target_url: string;
  scope: string;
  keywords: string[] | null;
  notes: string | null;
  status: string;
  routed_to: string;
  mcp_event_id: string | null;
  mcp_response: any;
  billing_status: string;
  amount_usd: number;
  created_at: string;
  completed_at: string | null;
}

interface SubmitOptions {
  targetUrl: string;
  scope?: "page" | "site" | "product" | "blog";
  keywords?: string[];
  notes?: string;
  orgId?: string;
}

const PER_REQUEST_PRICE_USD = 2.5;

/**
 * All SEO requests are routed through Sentinel MCP. FYSORA's non-fee status
 * does NOT cascade — every tailor / designer / org request is billable.
 */
export function useSeoOptimization(orgId?: string) {
  const [requests, setRequests] = useState<SeoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { dispatch } = useSentinelMcp();

  const refresh = useCallback(async () => {
    setLoading(true);
    const query = supabase
      .from("seo_optimization_requests" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    const { data, error } = orgId ? await query.eq("org_id", orgId) : await query;
    if (!error && data) setRequests(data as unknown as SeoRequest[]);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { refresh(); }, [refresh]);

  const submit = useCallback(async (opts: SubmitOptions) => {
    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("seo_optimization_requests" as any)
        .insert({
          requester_id: userData.user.id,
          org_id: opts.orgId ?? orgId ?? null,
          target_url: opts.targetUrl,
          scope: opts.scope ?? "page",
          keywords: opts.keywords ?? null,
          notes: opts.notes ?? null,
          status: "queued",
          routed_to: "sentinel_mcp",
          billing_status: "pending",
          amount_usd: PER_REQUEST_PRICE_USD,
        })
        .select()
        .single();
      if (error) throw error;

      // Route to Sentinel MCP (best-effort — failure doesn't block the queued request)
      if (opts.orgId ?? orgId) {
        try {
          await dispatch({
            eventType: "website.updated" as any,
            orgId: (opts.orgId ?? orgId)!,
            data: {
              seo_request_id: (data as any).id,
              target_url: opts.targetUrl,
              scope: opts.scope ?? "page",
              keywords: opts.keywords,
              tool: "sentinel_seo_optimize",
            },
            source: "seo_optimization",
            priority: "normal",
            silent: true,
          });
        } catch {
          // Sentinel MCP may not be configured for this org — request stays queued
        }
      }

      toast.success("SEO request routed to Sentinel MCP");
      await refresh();
      return data;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit SEO request");
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, [orgId, dispatch, refresh]);

  return { requests, loading, submitting, submit, refresh, perRequestPriceUsd: PER_REQUEST_PRICE_USD };
}
