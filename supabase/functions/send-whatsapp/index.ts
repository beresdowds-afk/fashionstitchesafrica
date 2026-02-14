import "https://deno.land/std@0.168.0/dotenv/load.ts";
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
    const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
    const TWILIO_WHATSAPP_NUMBER = Deno.env.get("TWILIO_WHATSAPP_NUMBER");

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_NUMBER) {
      return new Response(
        JSON.stringify({ error: "Twilio WhatsApp credentials not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      to,
      template_sid,
      template_variables,
      message,
      event_type,
      org_id,
      order_id,
      recipient_id,
      recipient_type,
    } = await req.json();

    if (!to) {
      return new Response(
        JSON.stringify({ error: "Missing required field: to (WhatsApp number in E.164 format)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

    const fromNumber = `whatsapp:${TWILIO_WHATSAPP_NUMBER}`;
    const toNumber = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;

    const bodyParams: Record<string, string> = {
      To: toNumber,
      From: fromNumber,
    };

    // Support Twilio Content Templates or plain messages
    if (template_sid) {
      bodyParams.ContentSid = template_sid;
      if (template_variables) {
        bodyParams.ContentVariables = JSON.stringify(template_variables);
      }
    } else if (message) {
      bodyParams.Body = message;
    } else {
      return new Response(
        JSON.stringify({ error: "Provide either template_sid or message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = new URLSearchParams(bodyParams);

    const twilioRes = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const twilioData = await twilioRes.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const logEntry = {
      org_id: org_id || null,
      order_id: order_id || null,
      channel: "whatsapp" as const,
      recipient_type: recipient_type || "customer",
      recipient_id: recipient_id || "00000000-0000-0000-0000-000000000000",
      recipient_contact: to,
      event_type: event_type || "general",
      subject: template_sid ? `Template: ${template_sid}` : null,
      body: message || null,
    };

    if (!twilioRes.ok) {
      if (org_id) {
        await supabaseAdmin.from("message_logs").insert({
          ...logEntry,
          status: "failed",
          error_message: JSON.stringify(twilioData),
        });
      }
      return new Response(
        JSON.stringify({ error: "Failed to send WhatsApp message", details: twilioData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (org_id) {
      await supabaseAdmin.from("message_logs").insert({
        ...logEntry,
        status: "sent",
        external_id: twilioData.sid || null,
        sent_at: new Date().toISOString(),
      });
    }

    return new Response(
      JSON.stringify({ success: true, sid: twilioData.sid }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-whatsapp error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
