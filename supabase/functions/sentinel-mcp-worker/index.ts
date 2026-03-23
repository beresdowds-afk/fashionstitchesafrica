import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Supported MCP tool mappings per event domain
const EVENT_TOOL_MAP: Record<string, string> = {
  // Website lifecycle
  "website.build_requested": "fsa_website_build",
  "website.published": "fsa_website_publish",
  "website.updated": "fsa_website_update",
  "website.domain_provisioned": "fsa_domain_provision",
  // Order lifecycle
  "order.created": "fsa_order_created",
  "order.status_changed": "fsa_order_status",
  "order.completed": "fsa_order_completed",
  "order.cancelled": "fsa_order_cancelled",
  // Payment lifecycle
  "payment.received": "fsa_payment_received",
  "payment.verified": "fsa_payment_verified",
  "payment.failed": "fsa_payment_failed",
  "payment.refunded": "fsa_payment_refunded",
  // Customer lifecycle
  "customer.registered": "fsa_customer_registered",
  "customer.measurement_booked": "fsa_measurement_booked",
  "customer.dispute_filed": "fsa_dispute_filed",
  // Communication events
  "comms.message_sent": "fsa_message_sent",
  "comms.notification_dispatched": "fsa_notification_dispatch",
  // AI/Premium features
  "ai.job_queued": "fsa_ai_job_queued",
  "ai.job_completed": "fsa_ai_job_completed",
  "ai.tryon_requested": "fsa_tryon_request",
  // Logistics
  "logistics.shipment_created": "fsa_shipment_created",
  "logistics.delivery_flagged": "fsa_delivery_flagged",
  "logistics.shipment_delivered": "fsa_shipment_delivered",
  // Catalogue
  "catalogue.item_added": "fsa_catalogue_item_added",
  "catalogue.item_updated": "fsa_catalogue_item_updated",
  "catalogue.featured_slot_booked": "fsa_featured_slot",
  // Contract events
  "contract.created": "fsa_contract_created",
  "contract.payment_recorded": "fsa_contract_payment",
  // Org lifecycle
  "org.created": "fsa_org_created",
  "org.member_joined": "fsa_member_joined",
  "org.subscription_changed": "fsa_subscription_changed",
};

interface McpToolCall {
  jsonrpc: "2.0";
  id: string;
  method: "tools/call";
  params: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface EventPayload {
  event_type: string;
  org_id: string;
  data: Record<string, unknown>;
  source?: string;
  priority?: "low" | "normal" | "high" | "critical";
}

// Rate limiting: per org, max 60 events/minute
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(orgId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(orgId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(orgId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 60) return false;
  entry.count++;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // User-scoped client for auth validation
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;

    // Service role client for DB operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Parse request
    const body: EventPayload | { action: string; org_id?: string; [key: string]: unknown } =
      await req.json();

    // Admin actions: configure, list-configs, event-history
    if ("action" in body) {
      return await handleAdminAction(body as any, userId, adminClient);
    }

    // Event dispatch
    const event = body as EventPayload;
    if (!event.event_type || !event.org_id) {
      return new Response(
        JSON.stringify({ error: "Missing event_type or org_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limit check
    if (!checkRateLimit(event.org_id)) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Max 60 events/minute per organization." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check org membership
    const { data: membership } = await adminClient
      .from("org_members")
      .select("role")
      .eq("user_id", userId)
      .eq("org_id", event.org_id)
      .eq("is_active", true)
      .maybeSingle();

    // Allow super_admins even without org membership
    const { data: superCheck } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!membership && !superCheck) {
      return new Response(
        JSON.stringify({ error: "Not a member of this organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get org MCP config
    const { data: mcpConfig } = await adminClient
      .from("mcp_worker_config")
      .select("*")
      .eq("org_id", event.org_id)
      .eq("is_enabled", true)
      .maybeSingle();

    // Fall back to platform-level config if no org-specific one
    let serverUrl: string | null = mcpConfig?.mcp_server_url || null;
    let authMethod: string = mcpConfig?.auth_method || "bearer";
    let routingConfig: Record<string, unknown> = mcpConfig?.event_routing || {};

    if (!serverUrl) {
      // Check for platform-level MCP config (org_id is null or a sentinel value)
      const { data: platformConfig } = await adminClient
        .from("platform_settings")
        .select("value")
        .eq("key", "sentinel_mcp_url")
        .maybeSingle();

      serverUrl = platformConfig?.value || null;
    }

    if (!serverUrl) {
      // Log the event as unrouted but don't fail
      await adminClient.from("mcp_event_log").insert({
        org_id: event.org_id,
        event_type: event.event_type,
        event_source: event.source || "dashboard",
        payload: event.data,
        status: "skipped",
        error_message: "No MCP server configured for this organization",
        processing_time_ms: Date.now() - startTime,
      });

      return new Response(
        JSON.stringify({
          status: "skipped",
          message: "No MCP server configured. Event logged.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if this event type is routed (if routing config exists)
    const isRouted =
      Object.keys(routingConfig).length === 0 ||
      (routingConfig as Record<string, boolean>)[event.event_type] !== false;

    if (!isRouted) {
      await adminClient.from("mcp_event_log").insert({
        org_id: event.org_id,
        event_type: event.event_type,
        event_source: event.source || "dashboard",
        payload: event.data,
        status: "skipped",
        error_message: "Event type disabled in routing config",
        processing_time_ms: Date.now() - startTime,
      });

      return new Response(
        JSON.stringify({ status: "skipped", message: "Event type not routed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve MCP tool name
    const toolName = EVENT_TOOL_MAP[event.event_type];
    if (!toolName) {
      await adminClient.from("mcp_event_log").insert({
        org_id: event.org_id,
        event_type: event.event_type,
        event_source: event.source || "dashboard",
        payload: event.data,
        status: "failed",
        error_message: `Unknown event type: ${event.event_type}`,
        processing_time_ms: Date.now() - startTime,
      });

      return new Response(
        JSON.stringify({ error: `Unknown event type: ${event.event_type}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build MCP Streamable HTTP request
    const mcpRequest: McpToolCall = {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: {
        name: toolName,
        arguments: {
          org_id: event.org_id,
          event_type: event.event_type,
          priority: event.priority || "normal",
          timestamp: new Date().toISOString(),
          source: event.source || "fsa_platform",
          ...event.data,
        },
      },
    };

    // Resolve auth headers for MCP server
    const mcpHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };

    if (authMethod === "bearer") {
      // Use platform-level MCP auth key
      const { data: mcpAuthKey } = await adminClient
        .from("platform_api_keys")
        .select("key_value")
        .eq("key_name", "sentinel_mcp_auth_key")
        .eq("is_active", true)
        .maybeSingle();

      if (mcpAuthKey?.key_value) {
        mcpHeaders["Authorization"] = `Bearer ${mcpAuthKey.key_value}`;
      }
    }

    // Call MCP server
    let mcpResponse: Record<string, unknown> | null = null;
    let mcpStatus = "completed";
    let errorMsg: string | null = null;

    try {
      const response = await fetch(serverUrl, {
        method: "POST",
        headers: mcpHeaders,
        body: JSON.stringify(mcpRequest),
      });

      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("text/event-stream")) {
        // Handle SSE stream — collect all events
        const textBody = await response.text();
        mcpResponse = { stream: true, body: textBody };
      } else {
        mcpResponse = await response.json();
      }

      if (!response.ok) {
        mcpStatus = "failed";
        errorMsg = `MCP server returned ${response.status}: ${JSON.stringify(mcpResponse)}`;
      }
    } catch (fetchErr) {
      mcpStatus = "failed";
      errorMsg =
        fetchErr instanceof Error
          ? `MCP server unreachable: ${fetchErr.message}`
          : "MCP server unreachable";
    }

    const processingTime = Date.now() - startTime;

    // Log event
    await adminClient.from("mcp_event_log").insert({
      org_id: event.org_id,
      event_type: event.event_type,
      event_source: event.source || "dashboard",
      payload: event.data,
      mcp_tool_name: toolName,
      mcp_response: mcpResponse,
      status: mcpStatus,
      error_message: errorMsg,
      processing_time_ms: processingTime,
      completed_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({
        status: mcpStatus,
        tool: toolName,
        mcp_request_id: mcpRequest.id,
        processing_time_ms: processingTime,
        response: mcpResponse,
      }),
      { status: mcpStatus === "completed" ? 200 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Sentinel MCP Worker error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Handle admin configuration actions
async function handleAdminAction(
  body: { action: string; org_id?: string; [key: string]: unknown },
  userId: string,
  adminClient: ReturnType<typeof createClient>
) {
  const { action, org_id } = body;

  switch (action) {
    case "configure": {
      if (!org_id) {
        return jsonResponse({ error: "org_id required" }, 400);
      }

      // Verify admin access
      const isAdmin = await verifyAdminAccess(userId, org_id, adminClient);
      if (!isAdmin) {
        return jsonResponse({ error: "Requires org admin or super admin" }, 403);
      }

      const { mcp_server_url, is_enabled, event_routing, auth_method, metadata } = body as any;

      const { data, error } = await adminClient
        .from("mcp_worker_config")
        .upsert(
          {
            org_id,
            mcp_server_url: mcp_server_url || "",
            is_enabled: is_enabled ?? true,
            event_routing: event_routing || {},
            auth_method: auth_method || "bearer",
            metadata: metadata || {},
          },
          { onConflict: "org_id" }
        )
        .select()
        .single();

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }

      return jsonResponse({ status: "configured", config: data });
    }

    case "list-configs": {
      // Super admin only
      const { data: superCheck } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "super_admin")
        .maybeSingle();

      if (!superCheck) {
        return jsonResponse({ error: "Super admin access required" }, 403);
      }

      const { data } = await adminClient
        .from("mcp_worker_config")
        .select("*, organizations(name)")
        .order("created_at", { ascending: false });

      return jsonResponse({ configs: data || [] });
    }

    case "event-history": {
      if (!org_id) {
        return jsonResponse({ error: "org_id required" }, 400);
      }

      const isAdmin = await verifyAdminAccess(userId, org_id, adminClient);
      if (!isAdmin) {
        return jsonResponse({ error: "Requires org admin or super admin" }, 403);
      }

      const limit = (body.limit as number) || 50;
      const statusFilter = body.status_filter as string | undefined;

      let query = adminClient
        .from("mcp_event_log")
        .select("*")
        .eq("org_id", org_id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (statusFilter) {
        query = query.eq("status", statusFilter);
      }

      const { data } = await query;

      return jsonResponse({ events: data || [] });
    }

    case "supported-events": {
      return jsonResponse({
        events: Object.entries(EVENT_TOOL_MAP).map(([eventType, toolName]) => ({
          event_type: eventType,
          mcp_tool: toolName,
          domain: eventType.split(".")[0],
        })),
      });
    }

    case "health": {
      if (!org_id) {
        return jsonResponse({ error: "org_id required" }, 400);
      }

      const { data: config } = await adminClient
        .from("mcp_worker_config")
        .select("mcp_server_url, is_enabled")
        .eq("org_id", org_id)
        .maybeSingle();

      if (!config?.mcp_server_url) {
        return jsonResponse({ status: "not_configured" });
      }

      // Ping MCP server with an initialize request
      try {
        const pingRes = await fetch(config.mcp_server_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: crypto.randomUUID(),
            method: "initialize",
            params: {
              protocolVersion: "2025-03-26",
              capabilities: {},
              clientInfo: { name: "fsa-sentinel-worker", version: "1.0.0" },
            },
          }),
        });

        const pingData = await pingRes.json();
        return jsonResponse({
          status: pingRes.ok ? "healthy" : "unhealthy",
          enabled: config.is_enabled,
          server_response: pingData,
        });
      } catch {
        return jsonResponse({ status: "unreachable", enabled: config.is_enabled });
      }
    }

    default:
      return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  }
}

async function verifyAdminAccess(
  userId: string,
  orgId: string,
  client: ReturnType<typeof createClient>
): Promise<boolean> {
  const [{ data: orgAdmin }, { data: superAdmin }] = await Promise.all([
    client
      .from("org_members")
      .select("role")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .in("role", ["org_admin", "manager"])
      .eq("is_active", true)
      .maybeSingle(),
    client
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle(),
  ]);

  return !!(orgAdmin || superAdmin);
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
