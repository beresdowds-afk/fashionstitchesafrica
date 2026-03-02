import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Ruler, Camera, Video, DollarSign } from "lucide-react";
import { usePremiumUsage } from "@/hooks/usePremiumFeatures";

interface PremiumUsagePanelProps {
  orgId: string;
}

const featureIcons: Record<string, any> = {
  ai_measurement: Ruler,
  virtual_tryon: Camera,
  video_call: Video,
};

const featureLabels: Record<string, string> = {
  ai_measurement: "AI Measurement",
  virtual_tryon: "Virtual Try-On",
  video_call: "Video Call",
};

const PremiumUsagePanel = ({ orgId }: PremiumUsagePanelProps) => {
  const { usage, loading, summary } = usePremiumUsage(orgId);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Ruler, label: "AI Measurements", value: summary.ai_measurements, color: "text-primary" },
          { icon: Camera, label: "Virtual Try-Ons", value: summary.virtual_tryons, color: "text-secondary" },
          { icon: Video, label: "Video Calls", value: summary.video_calls, color: "text-accent" },
          { icon: DollarSign, label: "Total Spent", value: `$${summary.totalSpent.toFixed(2)}`, color: "text-primary" },
        ].map(stat => (
          <Card key={stat.label} className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon size={16} className={stat.color} />
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
            <p className="font-heading font-bold text-xl">{stat.value}</p>
          </Card>
        ))}
      </div>

      {/* Usage Log */}
      <Card className="p-6">
        <h3 className="font-heading font-semibold text-lg mb-4">Usage History</h3>
        {usage.length === 0 ? (
          <p className="text-sm text-muted-foreground">No premium feature usage yet.</p>
        ) : (
          <div className="space-y-2">
            {usage.map(record => {
              const Icon = featureIcons[record.feature_type] || Ruler;
              return (
                <div key={record.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-3">
                    <Icon size={16} className="text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{featureLabels[record.feature_type] || record.feature_type}</p>
                      <p className="text-xs text-muted-foreground">{new Date(record.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {record.is_included ? (
                      <Badge variant="secondary">Included</Badge>
                    ) : (
                      <span className="text-sm font-medium">${(record.unit_price * record.credits_used).toFixed(2)}</span>
                    )}
                    <Badge variant={record.billed_to === "user" ? "outline" : "default"} className="text-[10px]">
                      {record.billed_to}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};

export default PremiumUsagePanel;
