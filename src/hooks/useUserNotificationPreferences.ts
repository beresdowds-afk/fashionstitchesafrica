import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface UserNotifPrefs {
  id: string;
  user_id: string;
  org_id: string;
  order_status_email: boolean;
  order_status_sms: boolean;
  order_status_whatsapp: boolean;
  payment_email: boolean;
  payment_sms: boolean;
  payment_whatsapp: boolean;
  due_reminder_email: boolean;
  due_reminder_sms: boolean;
  due_reminder_whatsapp: boolean;
}

export const useUserNotificationPreferences = (orgId: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: prefs, isLoading } = useQuery({
    queryKey: ["user-notif-prefs", orgId, user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("user_notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return data as UserNotifPrefs | null;
    },
    enabled: !!orgId && !!user,
  });

  const upsertPrefs = useMutation({
    mutationFn: async (updates: Partial<UserNotifPrefs>) => {
      if (!user) throw new Error("Not authenticated");
      if (prefs?.id) {
        const { error } = await supabase
          .from("user_notification_preferences")
          .update(updates)
          .eq("id", prefs.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_notification_preferences")
          .insert({ user_id: user.id, org_id: orgId, ...updates });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-notif-prefs", orgId, user?.id] });
      toast({ title: "Preferences saved", description: "Your notification preferences have been updated." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return { prefs, isLoading, upsertPrefs };
};
