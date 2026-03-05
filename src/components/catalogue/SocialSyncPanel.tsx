import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Instagram, Facebook, Twitter, Linkedin, Youtube, RefreshCw, ArrowUpDown, ArrowDown, ArrowUp, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SocialSyncPanelProps {
  ownerId: string;
  ownerType: "organization" | "tailor";
  orgId?: string;
}

const TikTokIcon = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
  </svg>
);

const PLATFORMS = [
  { id: "instagram", label: "Instagram", icon: Instagram, color: "text-pink-500" },
  { id: "facebook", label: "Facebook", icon: Facebook, color: "text-blue-600" },
  { id: "twitter", label: "X / Twitter", icon: Twitter, color: "text-foreground" },
  { id: "tiktok", label: "TikTok", icon: TikTokIcon, color: "text-foreground" },
  { id: "youtube", label: "YouTube", icon: Youtube, color: "text-red-500" },
  { id: "linkedin", label: "LinkedIn", icon: Linkedin, color: "text-blue-700" },
];

const DIRECTION_OPTIONS = [
  { value: "pull", label: "Pull from social", icon: ArrowDown, desc: "Import content from social media into catalogue" },
  { value: "push", label: "Push to social", icon: ArrowUp, desc: "Share catalogue items to social media" },
  { value: "both", label: "Bidirectional", icon: ArrowUpDown, desc: "Full sync in both directions" },
];

interface SyncConfig {
  id: string;
  platform: string;
  account_handle: string | null;
  account_url: string | null;
  sync_direction: string;
  is_enabled: boolean;
  auto_publish: boolean;
  last_synced_at: string | null;
  sync_status: string;
  sync_frequency: string;
}

const SocialSyncPanel = ({ ownerId, ownerType, orgId }: SocialSyncPanelProps) => {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<SyncConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConfigs = async () => {
    const { data } = await supabase
      .from("social_sync_configs")
      .select("*")
      .eq("owner_id", ownerId)
      .order("platform");
    setConfigs((data as SyncConfig[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchConfigs(); }, [ownerId]);

  const upsertConfig = async (platform: string, updates: Partial<SyncConfig>) => {
    const existing = configs.find(c => c.platform === platform);
    if (existing) {
      await supabase.from("social_sync_configs").update(updates as any).eq("id", existing.id);
      setConfigs(prev => prev.map(c => c.id === existing.id ? { ...c, ...updates } : c));
    } else {
      const { data } = await supabase.from("social_sync_configs").insert({
        owner_id: ownerId,
        owner_type: ownerType,
        org_id: orgId || null,
        platform,
        ...updates,
      } as any).select().single();
      if (data) setConfigs(prev => [...prev, data as SyncConfig]);
    }
    toast({ title: "Sync settings updated" });
  };

  const triggerSync = async (platform: string) => {
    const config = configs.find(c => c.platform === platform);
    if (!config) return;
    await supabase.from("social_sync_configs").update({ sync_status: "syncing" } as any).eq("id", config.id);
    setConfigs(prev => prev.map(c => c.id === config.id ? { ...c, sync_status: "syncing" } : c));
    
    // Simulate sync completion after 2s (real implementation would use edge function)
    setTimeout(async () => {
      await supabase.from("social_sync_configs").update({ 
        sync_status: "completed", 
        last_synced_at: new Date().toISOString() 
      } as any).eq("id", config.id);
      setConfigs(prev => prev.map(c => c.id === config.id ? { ...c, sync_status: "completed", last_synced_at: new Date().toISOString() } : c));
      toast({ title: `${platform} sync completed` });
    }, 2000);
  };

  if (loading) {
    return <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-1">
        <Globe size={18} className="text-primary" />
        <h3 className="font-heading font-semibold text-lg">Social Media Sync</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-6">
        {ownerType === "tailor" 
          ? "Sync your social media content to your personal catalogue." 
          : "Sync catalogue items with your organization's social media accounts, website, and apps."}
      </p>

      <div className="space-y-4">
        {PLATFORMS.map(platform => {
          const config = configs.find(c => c.platform === platform.id);
          const isEnabled = config?.is_enabled || false;
          const Icon = platform.icon;

          return (
            <div key={platform.id} className={`rounded-xl border p-4 transition-colors ${isEnabled ? "border-primary/30 bg-primary/5" : "border-border"}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center bg-muted ${platform.color}`}>
                    <Icon size={18} />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{platform.label}</p>
                    {config?.last_synced_at && (
                      <p className="text-[10px] text-muted-foreground">
                        Last synced: {new Date(config.last_synced_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {config?.sync_status === "syncing" && (
                    <Badge className="bg-primary/10 text-primary text-[10px] animate-pulse">Syncing...</Badge>
                  )}
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={v => upsertConfig(platform.id, { is_enabled: v })}
                  />
                </div>
              </div>

              {isEnabled && (
                <div className="space-y-3 pt-3 border-t border-border">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Account Handle</Label>
                      <Input
                        placeholder={`@${platform.id}_handle`}
                        defaultValue={config?.account_handle || ""}
                        onBlur={e => upsertConfig(platform.id, { account_handle: e.target.value })}
                        className="text-sm mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Profile URL</Label>
                      <Input
                        placeholder={`https://${platform.id}.com/...`}
                        defaultValue={config?.account_url || ""}
                        onBlur={e => upsertConfig(platform.id, { account_url: e.target.value })}
                        className="text-sm mt-1"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 items-center">
                    <div className="flex-1 min-w-[160px]">
                      <Label className="text-xs">Sync Direction</Label>
                      <Select
                        value={config?.sync_direction || "both"}
                        onValueChange={v => upsertConfig(platform.id, { sync_direction: v })}
                      >
                        <SelectTrigger className="mt-1 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(ownerType === "tailor" ? DIRECTION_OPTIONS : DIRECTION_OPTIONS).map(d => (
                            <SelectItem key={d.value} value={d.value}>
                              <span className="flex items-center gap-1.5">
                                <d.icon size={12} /> {d.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 min-w-[140px]">
                      <Label className="text-xs">Frequency</Label>
                      <Select
                        value={config?.sync_frequency || "daily"}
                        onValueChange={v => upsertConfig(platform.id, { sync_frequency: v })}
                      >
                        <SelectTrigger className="mt-1 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hourly">Hourly</SelectItem>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="manual">Manual only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2 pt-4">
                      <label className="flex items-center gap-1.5 text-xs">
                        <Switch
                          checked={config?.auto_publish || false}
                          onCheckedChange={v => upsertConfig(platform.id, { auto_publish: v })}
                          className="scale-75"
                        />
                        Auto-publish
                      </label>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => triggerSync(platform.id)}
                    disabled={config?.sync_status === "syncing"}
                    className="gap-1.5"
                  >
                    <RefreshCw size={12} className={config?.sync_status === "syncing" ? "animate-spin" : ""} />
                    Sync Now
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default SocialSyncPanel;
