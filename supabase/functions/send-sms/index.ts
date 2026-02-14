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
    const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      return new Response(
        JSON.stringify({ error: "Twilio credentials not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      to,
      message,
      event_type,
      // For logging
      org_id,
      order_id,
      recipient_id,
      recipient_type,
    } = await req.json();

    if (!to || !message) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, message" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send via Twilio REST API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

    const body = new URLSearchParams({
      To: to,
      From: TWILIO_PHONE_NUMBER,
      Body: message,
    });

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

    if (!twilioRes.ok) {
      // Log failure
      if (org_id) {
        await supabaseAdmin.from("message_logs").insert({
          org_id,
          order_id: order_id || null,
          channel: "sms",
          recipient_type: recipient_type || "customer",
          recipient_id: recipient_id || "00000000-0000-0000-0000-000000000000",
          recipient_contact: to,
          event_type: event_type || "general",
          subject: null,
          body: message,
          status: "failed",
          error_message: JSON.stringify(twilioData),
        });
      }

      return new Response(
        JSON.stringify({ error: "Failed to send SMS", details: twilioData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log success
    if (org_id) {
      await supabaseAdmin.from("message_logs").insert({
        org_id,
        order_id: order_id || null,
        channel: "sms",
        recipient_type: recipient_type || "customer",
        recipient_id: recipient_id || "00000000-0000-0000-0000-000000000000",
        recipient_contact: to,
        event_type: event_type || "general",
        subject: null,
        body: message,
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
    console.error("send-sms error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
