import { supabase } from "@/integrations/supabase/client";
import { useCallback } from "react";
import { toast } from "sonner";

// Supported FSA event types for the Sentinel MCP worker
export type McpEventDomain =
  | "website"
  | "order"
  | "payment"
  | "customer"
  | "comms"
  | "ai"
  | "logistics"
  | "catalogue"
  | "contract"
  | "org";

export type McpEventType =
  | "website.build_requested"
  | "website.published"
  | "website.updated"
  | "website.domain_provisioned"
  | "order.created"
  | "order.status_changed"
  | "order.completed"
  | "order.cancelled"
  | "payment.received"
  | "payment.verified"
  | "payment.failed"
  | "payment.refunded"
  | "customer.registered"
  | "customer.measurement_booked"
  | "customer.dispute_filed"
  | "comms.message_sent"
  | "comms.notification_dispatched"
  | "ai.job_queued"
  | "ai.job_completed"
  | "ai.tryon_requested"
  | "logistics.shipment_created"
  | "logistics.delivery_flagged"
  | "logistics.shipment_delivered"
  | "catalogue.item_added"
  | "catalogue.item_updated"
  | "catalogue.featured_slot_booked"
  | "contract.created"
  | "contract.payment_recorded"
  | "org.created"
  | "org.member_joined"
  | "org.subscription_changed";

export type McpPriority = "low" | "normal" | "high" | "critical";

interface DispatchOptions {
  eventType: McpEventType;
  orgId: string;
  data: Record<string, unknown>;
  source?: string;
  priority?: McpPriority;
  silent?: boolean;
}

interface McpConfigOptions {
  orgId: string;
  mcpServerUrl: string;
  isEnabled?: boolean;
  eventRouting?: Record<string, boolean>;
  authMethod?: "bearer" | "api_key";
}

export function useSentinelMcp() {
  const dispatch = useCallback(async (options: DispatchOptions) => {
    const { eventType, orgId, data, source = "dashboard", priority = "normal", silent = false } = options;

    try {
      const { data: result, error } = await supabase.functions.invoke("sentinel-mcp-worker", {
        body: {
          event_type: eventType,
          org_id: orgId,
          data,
          source,
          priority,
        },
      });

      if (error) throw error;

      if (!silent) {
        if (result?.status === "completed") {
          toast.success("Event dispatched to Sentinel MCP");
        } else if (result?.status === "skipped") {
          toast.info(result.message || "Event skipped");
        } else if (result?.status === "failed") {
          toast.error("MCP processing failed");
        }
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to dispatch event";
      if (!silent) toast.error(message);
      throw err;
    }
  }, []);

  const configure = useCallback(async (options: McpConfigOptions) => {
    const { orgId, mcpServerUrl, isEnabled = true, eventRouting = {}, authMethod = "bearer" } = options;

    const { data, error } = await supabase.functions.invoke("sentinel-mcp-worker", {
      body: {
        action: "configure",
        org_id: orgId,
        mcp_server_url: mcpServerUrl,
        is_enabled: isEnabled,
        event_routing: eventRouting,
        auth_method: authMethod,
      },
    });

    if (error) throw error;
    return data;
  }, []);

  const getEventHistory = useCallback(async (orgId: string, limit = 50, statusFilter?: string) => {
    const { data, error } = await supabase.functions.invoke("sentinel-mcp-worker", {
      body: {
        action: "event-history",
        org_id: orgId,
        limit,
        status_filter: statusFilter,
      },
    });

    if (error) throw error;
    return data?.events || [];
  }, []);

  const getSupportedEvents = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("sentinel-mcp-worker", {
      body: { action: "supported-events" },
    });

    if (error) throw error;
    return data?.events || [];
  }, []);

  const healthCheck = useCallback(async (orgId: string) => {
    const { data, error } = await supabase.functions.invoke("sentinel-mcp-worker", {
      body: { action: "health", org_id: orgId },
    });

    if (error) throw error;
    return data;
  }, []);

  const listConfigs = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("sentinel-mcp-worker", {
      body: { action: "list-configs" },
    });

    if (error) throw error;
    return data?.configs || [];
  }, []);

  return {
    dispatch,
    configure,
    getEventHistory,
    getSupportedEvents,
    healthCheck,
    listConfigs,
  };
}
