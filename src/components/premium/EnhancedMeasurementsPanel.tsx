import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Ruler, User, Trash2, Eye } from "lucide-react";
import { useMeasurementProfiles } from "@/hooks/useMeasurementProfiles";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface EnhancedMeasurementsPanelProps {
  orgId: string;
  role: string | null;
}

const MEASUREMENT_LABELS: Record<string, string> = {
  Chest: "Chest", Waist: "Waist", Hips: "Hips",
  "Shoulder Width": "Shoulder Width", "Sleeve Length": "Sleeve Length",
  Inseam: "Inseam", Neck: "Neck", "Back Length": "Back Length",
  "Arm Length": "Arm Length", "Thigh": "Thigh", "Calf": "Calf",
  "Wrist": "Wrist", "Bicep": "Bicep", "Ankle": "Ankle",
  "Torso Length": "Torso Length", "Rise": "Rise",
};

const EnhancedMeasurementsPanel = ({ orgId, role }: EnhancedMeasurementsPanelProps) => {
  const { profiles, loading, deleteProfile } = useMeasurementProfiles(orgId);
  const isAdmin = role === "org_admin" || role === "manager" || role === "super_admin";
  const [selectedProfile, setSelectedProfile] = useState<any>(null);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Ruler size={18} className="text-primary" />
            <h3 className="font-heading font-semibold text-lg">Measurement Profiles</h3>
          </div>
          <Badge variant="secondary">{profiles.length} profiles</Badge>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          AI-captured and manually entered body measurements for your customers. These are used for accurate tailoring and virtual try-on.
        </p>

        {profiles.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No measurement profiles yet. They'll appear here after AI measurement sessions or manual entry.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {profiles.map(profile => {
              const measurements = profile.measurements as Record<string, string>;
              const measurementCount = Object.keys(measurements).length;
              return (
                <div key={profile.id} className="rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <User size={14} className="text-muted-foreground" />
                      <span className="font-medium text-sm">{profile.profile_name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedProfile(profile)}>
                            <Eye size={12} />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>{profile.profile_name} — Measurements</DialogTitle>
                          </DialogHeader>
                          <div className="grid grid-cols-2 gap-3 mt-4">
                            {Object.entries(measurements).map(([key, value]) => (
                              <div key={key} className="flex justify-between p-2 rounded-lg bg-muted/50">
                                <span className="text-sm text-muted-foreground">{MEASUREMENT_LABELS[key] || key}</span>
                                <span className="text-sm font-medium">{value}</span>
                              </div>
                            ))}
                          </div>
                        </DialogContent>
                      </Dialog>
                      {isAdmin && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteProfile(profile.id)}>
                          <Trash2 size={12} />
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{measurementCount} measurements</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {Object.entries(measurements).slice(0, 4).map(([key, value]) => (
                      <Badge key={key} variant="outline" className="text-[10px]">
                        {key}: {value}
                      </Badge>
                    ))}
                    {measurementCount > 4 && (
                      <Badge variant="outline" className="text-[10px]">+{measurementCount - 4} more</Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-2">{new Date(profile.created_at).toLocaleDateString()}</p>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Premium measurement features info */}
      <Card className="p-6 border-primary/20 bg-primary/5">
        <h3 className="font-heading font-semibold text-lg mb-2">Enhanced AI Measurements</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Our enhanced AI measurement system captures 16+ body points with improved accuracy. Available through AI Measurement bookings.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {["Chest", "Waist", "Hips", "Shoulders", "Sleeve", "Inseam", "Neck", "Back", "Arm", "Thigh", "Calf", "Wrist", "Bicep", "Ankle", "Torso", "Rise"].map(m => (
            <div key={m} className="text-xs p-2 rounded bg-background border border-border text-center">{m}</div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default EnhancedMeasurementsPanel;
