import { supabase } from "@/integrations/supabase/client";

interface NotifyParams {
  orgId: string;
  orderId?: string;
  orderNumber?: string;
  orderTitle?: string;
  eventType: "order_status_change" | "payment_received" | "due_date_reminder" | "measurement_confirmed" | "measurement_completed";
  oldStatus?: string;
  newStatus?: string;
  amount?: number;
  currency?: string;
  bookingId?: string;
  hoursBooked?: number;
  scheduledAt?: string;
  customerId?: string;
}

/**
 * Dispatches notifications via enabled channels (email, SMS) based on org settings.
 * Runs in the background — does not block UI.
 */
export const dispatchNotifications = async (params: NotifyParams) => {
  try {
    // 1. Fetch org notification settings
    const { data: settings } = await supabase
      .from("org_notification_settings")
      .select("*")
      .eq("org_id", params.orgId)
      .maybeSingle();

    if (!settings) return; // No settings configured — skip

    // 2. Fetch org details for branding
    const { data: org } = await supabase
      .from("organizations")
      .select("name, email, phone")
      .eq("id", params.orgId)
      .single();

    // 3. Build subject/message based on event
    let emailSubject = "";
    let smsMessage = "";
    const orgName = org?.name || "Your Organization";

    if (params.eventType === "order_status_change") {
      emailSubject = `Order ${params.orderNumber} — Status Updated to ${capitalize(params.newStatus || "")}`;
      smsMessage = `[${orgName}] Order ${params.orderNumber} "${params.orderTitle}" status: ${capitalize(params.oldStatus || "")} → ${capitalize(params.newStatus || "")}`;
    } else if (params.eventType === "payment_received") {
      emailSubject = `Payment Received for Order ${params.orderNumber}`;
      smsMessage = `[${orgName}] Payment of ${params.currency || ""} ${(params.amount || 0).toLocaleString()} received for order ${params.orderNumber}.`;
    } else if (params.eventType === "due_date_reminder") {
      emailSubject = `Reminder: Order ${params.orderNumber} Due Soon`;
      smsMessage = `[${orgName}] Reminder: Order ${params.orderNumber} "${params.orderTitle}" is due soon.`;
    } else if (params.eventType === "measurement_confirmed") {
      const schedText = params.scheduledAt ? ` scheduled for ${new Date(params.scheduledAt).toLocaleString()}` : "";
      emailSubject = `AI Measurement Session Confirmed — ${params.hoursBooked || 1}h${schedText}`;
      smsMessage = `[${orgName}] Your AI measurement session (${params.hoursBooked || 1}h) is confirmed${schedText}.`;
    } else if (params.eventType === "measurement_completed") {
      emailSubject = `AI Measurement Session Completed`;
      smsMessage = `[${orgName}] Your AI measurement session has been completed. Your measurements are now on file.`;
    }

    // 4. Get recipients (admins, tailors based on order)
    const recipients: { id: string; type: "org_admin" | "tailor" | "customer"; email?: string; phone?: string; name?: string }[] = [];

    if (settings.notify_org_admin) {
      const { data: admins } = await supabase
        .from("org_members")
        .select("user_id")
        .eq("org_id", params.orgId)
        .eq("role", "org_admin")
        .eq("is_active", true);

      if (admins) {
        for (const admin of admins) {
          const { data: authData } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", admin.user_id)
            .single();

          recipients.push({
            id: admin.user_id,
            type: "org_admin",
            name: authData?.display_name || undefined,
          });
        }
      }
    }

    // For now, we send emails to admins using the org email as fallback
    // In production, you'd fetch user emails from auth.users via a service role function
    const orgEmail = org?.email;

    // 5. Send via enabled channels (fire-and-forget)
    const basePayload = {
      org_id: params.orgId,
      order_id: params.orderId || null,
      event_type: params.eventType,
      order_number: params.orderNumber,
      order_title: params.orderTitle,
      old_status: params.oldStatus,
      new_status: params.newStatus,
      amount: params.amount,
      currency: params.currency,
      org_name: orgName,
      brand_color: settings.brand_color,
      email_footer_text: settings.email_footer_text,
    };

    // Email
    if (settings.email_enabled && orgEmail && emailSubject) {
      supabase.functions.invoke("send-email", {
        body: {
          ...basePayload,
          to: orgEmail,
          subject: emailSubject,
          recipient_id: recipients[0]?.id || null,
          recipient_type: "org_admin",
          recipient_name: recipients[0]?.name,
        },
      }).catch((e) => console.error("Email dispatch failed:", e));
    }

    // SMS
    if (settings.sms_enabled && org?.phone && smsMessage) {
      supabase.functions.invoke("send-sms", {
        body: {
          ...basePayload,
          to: org.phone,
          message: smsMessage,
          recipient_id: recipients[0]?.id || null,
          recipient_type: "org_admin",
        },
      }).catch((e) => console.error("SMS dispatch failed:", e));
    }

    // WhatsApp
    if (settings.whatsapp_enabled && org?.phone && smsMessage) {
      supabase.functions.invoke("send-whatsapp", {
        body: {
          ...basePayload,
          to: org.phone,
          message: smsMessage,
          recipient_id: recipients[0]?.id || null,
          recipient_type: "org_admin",
        },
      }).catch((e) => console.error("WhatsApp dispatch failed:", e));
    }
  } catch (err) {
    console.error("dispatchNotifications error:", err);
  }
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
