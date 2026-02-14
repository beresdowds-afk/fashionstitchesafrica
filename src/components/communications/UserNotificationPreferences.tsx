import { useUserNotificationPreferences } from "@/hooks/useUserNotificationPreferences";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Mail, Phone, MessageSquare } from "lucide-react";
import { useState, useEffect } from "react";

interface Props {
  orgId: string;
}

const eventTypes = [
  { key: "order_status", label: "Order Status Changes", desc: "When your order moves to the next stage" },
  { key: "payment", label: "Payment Confirmations", desc: "Receipts and payment confirmations" },
  { key: "due_reminder", label: "Due Date Reminders", desc: "Alerts about approaching deadlines" },
] as const;

const channels = [
  { key: "email", icon: Mail, label: "Email" },
  { key: "sms", icon: Phone, label: "SMS" },
  { key: "whatsapp", icon: MessageSquare, label: "WhatsApp" },
] as const;

type PrefKey = `${typeof eventTypes[number]["key"]}_${typeof channels[number]["key"]}`;

const UserNotificationPreferences = ({ orgId }: Props) => {
  const { prefs, isLoading, upsertPrefs } = useUserNotificationPreferences(orgId);

  const defaults: Record<PrefKey, boolean> = {
    order_status_email: true,
    order_status_sms: true,
    order_status_whatsapp: true,
    payment_email: true,
    payment_sms: true,
    payment_whatsapp: true,
    due_reminder_email: true,
    due_reminder_sms: false,
    due_reminder_whatsapp: false,
  };

  const [form, setForm] = useState<Record<PrefKey, boolean>>(defaults);

  useEffect(() => {
    if (prefs) {
      setForm({
        order_status_email: prefs.order_status_email,
        order_status_sms: prefs.order_status_sms,
        order_status_whatsapp: prefs.order_status_whatsapp,
        payment_email: prefs.payment_email,
        payment_sms: prefs.payment_sms,
        payment_whatsapp: prefs.payment_whatsapp,
        due_reminder_email: prefs.due_reminder_email,
        due_reminder_sms: prefs.due_reminder_sms,
        due_reminder_whatsapp: prefs.due_reminder_whatsapp,
      });
    }
  }, [prefs]);

  const handleSave = () => {
    upsertPrefs.mutate(form);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-heading font-semibold text-lg mb-1">Your Notification Preferences</h3>
        <p className="text-sm text-muted-foreground">Choose how you'd like to be notified for each event type.</p>
      </div>

      <div className="rounded-xl bg-card border border-border overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_repeat(3,80px)] gap-2 px-6 py-3 border-b border-border bg-muted/30">
          <span className="text-xs font-medium text-muted-foreground">Event</span>
          {channels.map((ch) => (
            <div key={ch.key} className="flex flex-col items-center gap-1">
              <ch.icon size={14} className="text-muted-foreground" />
              <span className="text-[10px] font-medium text-muted-foreground">{ch.label}</span>
            </div>
          ))}
        </div>

        {/* Event rows */}
        {eventTypes.map((evt) => (
          <div
            key={evt.key}
            className="grid grid-cols-[1fr_repeat(3,80px)] gap-2 px-6 py-4 border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
          >
            <div>
              <p className="text-sm font-medium">{evt.label}</p>
              <p className="text-xs text-muted-foreground">{evt.desc}</p>
            </div>
            {channels.map((ch) => {
              const key = `${evt.key}_${ch.key}` as PrefKey;
              return (
                <div key={ch.key} className="flex items-center justify-center">
                  <Switch
                    checked={form[key]}
                    onCheckedChange={(v) => setForm((prev) => ({ ...prev, [key]: v }))}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={upsertPrefs.isPending}>
          {upsertPrefs.isPending ? "Saving…" : "Save Preferences"}
        </Button>
      </div>
    </div>
  );
};

export default UserNotificationPreferences;
