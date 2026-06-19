import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ShieldCheck, Info } from "lucide-react";
import { useOrgRiskScore, tierLabels, tierColors } from "@/hooks/useInsurance";
import { useInsuranceFlag } from "@/hooks/useInsuranceFlags";
import { useInsuranceConfig } from "@/hooks/useInsuranceConfig";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export default function RiskScoreCard({ orgId }: { orgId: string }) {
  const { enabled } = useInsuranceFlag("risk_engine");
  const { data: risk, isLoading } = useOrgRiskScore(orgId);
  const { data: cfg } = useInsuranceConfig();

  if (!enabled) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-[hsl(43,65%,38%)]" />
            Insurance Risk Score
          </span>
          {cfg && (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label="Risk score breakdown" className="text-muted-foreground hover:text-foreground">
                    <Info size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs text-xs">
                  <p className="font-semibold mb-1">How this score is calculated</p>
                  <p className="mb-2 text-muted-foreground">
                    Lower scores mean lower risk. Five factors are weighted:
                  </p>
                  <ul className="space-y-0.5">
                    <li>• <b>Completion rate</b> — 35%</li>
                    <li>• <b>Customer rating</b> — 25%</li>
                    <li>• <b>Dispute history</b> — 20%</li>
                    <li>• <b>Experience</b> — 10%</li>
                    <li>• <b>On-time delivery</b> — 10%</li>
                  </ul>
                  <p className="font-semibold mt-2 mb-1">Tiers</p>
                  <ul className="space-y-0.5 text-muted-foreground">
                    <li>• Low: 0–{cfg.risk_threshold_low}</li>
                    <li>• Medium: {cfg.risk_threshold_low + 1}–{cfg.risk_threshold_medium}</li>
                    <li>• High: {cfg.risk_threshold_medium + 1}–{cfg.risk_threshold_high}</li>
                    <li>• Very High: {cfg.risk_threshold_high + 1}–100</li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading || !risk ? (
          <p className="text-sm text-muted-foreground">Computing…</p>
        ) : (
          <>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-heading font-bold">{risk.score}<span className="text-base text-muted-foreground">/100</span></p>
                <p className="text-xs text-muted-foreground">Lower is better</p>
              </div>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={cn("cursor-help rounded-full border px-2 py-0.5 text-xs font-semibold", tierColors[risk.tier])}>
                      {tierLabels[risk.tier]}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    {risk.tier === "low" && "Excellent track record. Premiums are at the lowest tier."}
                    {risk.tier === "medium" && "Average track record. Standard premiums apply."}
                    {risk.tier === "high" && "Elevated risk. Premiums are increased to cover claim likelihood."}
                    {risk.tier === "very_high" && "High claim probability. Coverage may be limited and premiums are at the top tier."}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Progress value={Math.max(5, 100 - risk.score)} className="h-2" />
            <ul className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              {risk.factors.completionRate !== undefined && (
                <li>Completion: <span className="text-foreground font-medium">{Math.round(risk.factors.completionRate * 100)}%</span></li>
              )}
              {risk.factors.rating !== undefined && (
                <li>Rating: <span className="text-foreground font-medium">{risk.factors.rating.toFixed(1)}/5</span></li>
              )}
              {risk.factors.disputeCount !== undefined && (
                <li>Disputes: <span className="text-foreground font-medium">{risk.factors.disputeCount}</span></li>
              )}
              {risk.factors.onTimeRate !== undefined && (
                <li>On-time: <span className="text-foreground font-medium">{Math.round(risk.factors.onTimeRate * 100)}%</span></li>
              )}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}