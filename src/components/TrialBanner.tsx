import { useMemo, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const TRIAL_DAYS = 90;

interface TrialBannerProps {
  /** Optional label for the user category, e.g. "Designer", "Tailor". */
  audience?: string;
  /** If true, the banner is hidden when the trial has expired (paid plan presumed elsewhere). */
  hideWhenExpired?: boolean;
  /** Called when the user clicks the upgrade CTA. */
  onUpgrade?: () => void;
  /** Optional override for the upgrade CTA label. */
  upgradeLabel?: string;
  /** If true, suppress the banner entirely (e.g. paid subscription active). */
  suppress?: boolean;
}

/**
 * Soft-gate trial banner shown across all portals during a 3-month
 * complimentary trial. Computed from the authenticated user's signup
 * date (auth.users.created_at). The banner is dismissible per-session
 * and never blocks portal functionality.
 */
export function TrialBanner({
  audience,
  hideWhenExpired = true,
  onUpgrade,
  upgradeLabel = "Upgrade plan",
  suppress = false,
}: TrialBannerProps) {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  const { daysLeft, expired } = useMemo(() => {
    if (!user?.created_at) return { daysLeft: TRIAL_DAYS, expired: false };
    const start = new Date(user.created_at).getTime();
    const end = start + TRIAL_DAYS * 24 * 60 * 60 * 1000;
    const ms = end - Date.now();
    const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
    return { daysLeft: Math.max(0, days), expired: ms <= 0 };
  }, [user?.created_at]);

  if (suppress || dismissed) return null;
  if (expired && hideWhenExpired) return null;
  if (!user) return null;

  return (
    <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex items-start gap-3 flex-1">
        <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Sparkles size={18} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-heading font-semibold text-sm">
            {expired
              ? `Your 3-month ${audience ? audience + " " : ""}trial has ended`
              : `${audience ? audience + " " : ""}trial: ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {expired
              ? "Upgrade to keep premium features active. Your portal stays accessible."
              : "All premium features are unlocked free for 3 months. No charges during trial."}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {onUpgrade && (
          <Button size="sm" variant="hero" onClick={onUpgrade}>
            {upgradeLabel}
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
        >
          <X size={14} />
        </Button>
      </div>
    </div>
  );
}

export default TrialBanner;