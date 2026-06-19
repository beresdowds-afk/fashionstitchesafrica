import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require authentication. Without this, any caller could relay WhatsApp
    // messages or post to social platforms as any org and burn its quota/credits.
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "",
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    );
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const callerId = userData.user.id;

    const {
      action = "send_message", // send_message | send_template | post_social | get_status
      to,
      message,
      template_name,
      template_params,
      media_url,
      social_platform, // instagram | facebook | twitter | tiktok
      social_content,
      social_media_urls,
      org_id,
      owner_id,
      owner_type = "organization",
      order_id,
      event_type,
      recipient_id,
      recipient_type,
    } = await req.json();

    // Resolve the WhatChimp API key for the owner
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Confirm the caller is an active member of the org/owner they claim to act for.
    const resolvedOwnerId = owner_id || org_id;
    if (!resolvedOwnerId) {
      return new Response(
        JSON.stringify({ error: "owner_id or org_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (owner_type === "organization") {
      const { data: membership } = await supabaseAdmin
        .from("org_members")
        .select("user_id")
        .eq("org_id", resolvedOwnerId)
        .eq("user_id", callerId)
        .eq("is_active", true)
        .maybeSingle();
      const { data: isSuper } = await supabaseAdmin.rpc("has_role", {
        _user_id: callerId,
        _role: "super_admin",
      });
      if (!membership && !isSuper) {
        return new Response(
          JSON.stringify({ error: "Caller is not a member of this organization" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (resolvedOwnerId !== callerId) {
      const { data: isSuper } = await supabaseAdmin.rpc("has_role", {
        _user_id: callerId,
        _role: "super_admin",
      });
      if (!isSuper) {
        return new Response(
          JSON.stringify({ error: "Caller may only act on their own account" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const { data: keyData } = await supabaseAdmin
      .from("whatchimp_api_keys")
      .select("api_key, whatsapp_number")
      .eq("owner_id", owner_id || org_id)
      .eq("owner_type", owner_type)
      .eq("is_active", true)
      .maybeSingle();

    // Fallback to platform-level WhatChimp key
    const apiKey = keyData?.api_key || Deno.env.get("WHATCHIMP_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "WhatChimp API key not configured for this account" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const WHATCHIMP_BASE_URL = Deno.env.get("WHATCHIMP_BASE_URL") || "https://api.whatchimp.com/v1";
    let result;

    switch (action) {
      case "send_message": {
        const payload: Record<string, unknown> = {
          to,
          message,
          type: media_url ? "media" : "text",
        };
        if (media_url) payload.media_url = media_url;

        const resp = await fetch(`${WHATCHIMP_BASE_URL}/whatsapp/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(payload),
        });
        result = await resp.json();

        // Log the message
        if (org_id) {
          await supabaseAdmin.from("message_logs").insert({
            org_id,
            order_id: order_id || null,
            channel: "whatsapp",
            recipient_type: recipient_type || "customer",
            recipient_id: recipient_id || "00000000-0000-0000-0000-000000000000",
            recipient_contact: to,
            event_type: event_type || "general",
            body: message,
            status: resp.ok ? "sent" : "failed",
            error_message: resp.ok ? null : JSON.stringify(result),
            external_id: result?.message_id || null,
            sent_at: resp.ok ? new Date().toISOString() : null,
          });
        }

        if (!resp.ok) {
          return new Response(
            JSON.stringify({ error: "WhatChimp send failed", details: result }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        break;
      }

      case "send_template": {
        const resp = await fetch(`${WHATCHIMP_BASE_URL}/whatsapp/template`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            to,
            template_name,
            parameters: template_params || [],
          }),
        });
        result = await resp.json();
        break;
      }

      case "post_social": {
        const resp = await fetch(`${WHATCHIMP_BASE_URL}/social/post`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            platforms: social_platform ? [social_platform] : ["instagram", "facebook"],
            content: social_content || message,
            media_urls: social_media_urls || (media_url ? [media_url] : []),
          }),
        });
        result = await resp.json();
        break;
      }

      case "get_status": {
        const resp = await fetch(`${WHATCHIMP_BASE_URL}/account/status`, {
          method: "GET",
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        result = await resp.json();
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify({ success: true, data: result, provider: "whatchimp" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("whatchimp-send error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
