import { useMemo, useState } from "react";
import { Shield, Wallet, BarChart3, FileText, Ruler, Building2, Loader2, Settings2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useInsuranceFlags, useUpdateInsuranceFlag } from "@/hooks/useInsuranceFlags";
import { useInsuranceConfig, useUpdateInsuranceConfig } from "@/hooks/useInsuranceConfig";
import type { InsuranceFlag, InsuranceConfig } from "@/lib/insurance/types";

const PHASE_META: Record<number, { icon: React.ElementType; tone: string }> = {
  1: { icon: Shield, tone: "border-l-[hsl(var(--gold))]" },
  2: { icon: Wallet, tone: "border-l-[hsl(var(--green))]" },
  3: { icon: BarChart3, tone: "border-l-blue-500" },
  4: { icon: FileText, tone: "border-l-purple-500" },
  5: { icon: Ruler, tone: "border-l-orange-500" },
  6: { icon: Building2, tone: "border-l-[hsl(var(--red))]" },
};

function FlagCard({ flag }: { flag: InsuranceFlag }) {
  const update = useUpdateInsuranceFlag();
  const { toast } = useToast();
  const meta = PHASE_META[flag.phase] ?? PHASE_META[1];
  const Icon = meta.icon;

  return (
    <Card className={`border-l-4 ${meta.tone}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Icon className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">{flag.flag_name}</CardTitle>
              {flag.description && (
                <p className="text-xs text-muted-foreground mt-1">{flag.description}</p>
              )}
            </div>
          </div>
          <Switch
            checked={flag.enabled}
            disabled={update.isPending}
            onCheckedChange={(checked) =>
              update.mutate(
                { id: flag.id, enabled: checked },
                {
                  onSuccess: () =>
                    toast({
                      title: checked ? "Phase enabled" : "Phase disabled",
                      description: flag.flag_name,
                    }),
                  onError: (e: any) =>
                    toast({ title: "Update failed", description: e.message, variant: "destructive" }),
                },
              )
            }
          />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                flag.enabled ? "bg-[hsl(var(--green))]" : "bg-muted-foreground/40"
              }`}
            />
            <span>{flag.enabled ? "Active" : "Inactive"}</span>
          </div>
          <span>
            Updated{" "}
            {flag.updated_at ? new Date(flag.updated_at).toLocaleDateString() : "—"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfigDrawer({ config }: { config: InsuranceConfig }) {
  const update = useUpdateInsuranceConfig();
  const { toast } = useToast();
  const [draft, setDraft] = useState<InsuranceConfig>(config);

  const numField = (key: keyof InsuranceConfig, label: string, step = 1) => (
    <div className="space-y-1">
      <Label htmlFor={String(key)} className="text-xs">{label}</Label>
      <Input
        id={String(key)}
        type="number"
        step={step}
        value={(draft[key] as number) ?? 0}
        onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
      />
    </div>
  );

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" /> Insurance Configuration
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Insurance Configuration</SheetTitle>
          <SheetDescription>
            Fees, splits, claim windows and risk tier thresholds.
          </SheetDescription>
        </SheetHeader>
        <div className="grid grid-cols-2 gap-3 mt-4">
          {numField("fee_min_percent", "Fee min %", 0.1)}
          {numField("fee_max_percent", "Fee max %", 0.1)}
          {numField("reserve_percent", "Reserve pool %", 1)}
          {numField("administration_percent", "Admin fee %", 1)}
          {numField("platform_percent", "Platform fee %", 1)}
          {numField("claims_window_days", "Claims window (days)", 1)}
          {numField("min_order_value", "Min order value", 1000)}
          {numField("max_coverage_per_claim", "Max coverage / claim", 10000)}
          {numField("default_excess", "Default excess", 100)}
        </div>
        <Separator className="my-4" />
        <h4 className="text-sm font-semibold mb-2">Risk tier thresholds</h4>
        <div className="grid grid-cols-3 gap-3">
          {numField("risk_threshold_low", "Low ≤")}
          {numField("risk_threshold_medium", "Medium ≤")}
          {numField("risk_threshold_high", "High ≤")}
        </div>
        <h4 className="text-sm font-semibold mb-2 mt-4">Fee multipliers per tier</h4>
        <div className="grid grid-cols-2 gap-3">
          {numField("fee_multiplier_low", "Low", 0.1)}
          {numField("fee_multiplier_medium", "Medium", 0.1)}
          {numField("fee_multiplier_high", "High", 0.1)}
          {numField("fee_multiplier_very_high", "Very high", 0.1)}
        </div>
        <Button
          className="w-full mt-6"
          disabled={update.isPending}
          onClick={() =>
            update.mutate(draft, {
              onSuccess: () => toast({ title: "Configuration saved" }),
              onError: (e: any) =>
                toast({ title: "Save failed", description: e.message, variant: "destructive" }),
            })
          }
        >
          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save configuration"}
        </Button>
      </SheetContent>
    </Sheet>
  );
}

export default function InsuranceFeatureFlagsPanel() {
  const flags = useInsuranceFlags();
  const cfg = useInsuranceConfig();

  const sorted = useMemo(
    () => (flags.data ?? []).slice().sort((a, b) => a.phase - b.phase),
    [flags.data],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-[hsl(var(--gold))]" />
            FYSORA Order Protection
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Protected transactions. Guaranteed satisfaction. Enable phases below to roll the
            feature out gradually. Coverage stays off until each phase is switched on.
          </p>
          <Badge variant="outline" className="mt-2">
            Protected by FYSORA
          </Badge>
        </div>
        {cfg.data && <ConfigDrawer config={cfg.data} />}
      </div>

      {flags.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : flags.error ? (
        <p className="text-sm text-destructive">
          Failed to load feature flags: {(flags.error as Error).message}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((f) => (
            <FlagCard key={f.id} flag={f} />
          ))}
        </div>
      )}
    </div>
  );
}