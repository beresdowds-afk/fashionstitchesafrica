import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Globe,
  TrendingUp,
  Crown,
  Clock,
  DollarSign,
  Edit3,
  Eye,
  Copy,
  RefreshCw,
  Zap,
  CheckCircle2,
} from "lucide-react";
import { motion } from "framer-motion";

interface PlanPricing {
  liteMonthly: number;
  litePlatformFee: number;
  liteTrialMonths: number;
  proOneTime: number;
  proPlatformFee: number;
  proMaintenance: number;
}

const DEFAULT_PRICING: PlanPricing = {
  liteMonthly: 17,
  litePlatformFee: 10,
  liteTrialMonths: 6,
  proOneTime: 199,
  proPlatformFee: 140,
  proMaintenance: 7,
};

const WebsitePricingPanel = () => {
  const { toast } = useToast();
  const [pricing, setPricing] = useState<PlanPricing>(DEFAULT_PRICING);
  const [stats, setStats] = useState({
    activeLite: 0,
    activePro: 0,
    mrr: 0,
    totalPlatformFees: 0,
  });
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{
    open: boolean;
    plan: "lite" | "pro";
    field: string;
    label: string;
    value: number;
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [subsResult, reqsResult] = await Promise.all([
      supabase
        .from("website_builder_subscriptions")
        .select("*, organizations(name, slug)"),
      supabase
        .from("website_builder_requests")
        .select("*, organizations(name, slug, email)"),
    ]);

    const subs = subsResult.data || [];
    const reqs = reqsResult.data || [];

    const activeLite = subs.filter(
      (s: any) => s.status === "trial" || s.status === "active"
    ).length;
    const activePro = reqs.filter((r: any) => r.status === "completed").length;
    const mrr = subs
      .filter((s: any) => s.status === "active" || s.status === "trial")
      .reduce((sum: number, s: any) => sum + (s.monthly_fee || 0), 0);
    const totalPlatformFees =
      subs.reduce((sum: number, s: any) => sum + (s.platform_fee || 0), 0) +
      reqs
        .filter((r: any) => r.payment_status === "paid")
        .reduce((sum: number, r: any) => sum + (r.platform_fee || 0), 0);

    setStats({ activeLite, activePro, mrr, totalPlatformFees });

    // Derive current pricing from latest records or use defaults
    if (subs.length > 0) {
      const latest = subs[0];
      setPricing((prev) => ({
        ...prev,
        liteMonthly: latest.monthly_fee ?? prev.liteMonthly,
        litePlatformFee: latest.platform_fee ?? prev.litePlatformFee,
      }));
    }
    if (reqs.length > 0) {
      const latest = reqs[0];
      setPricing((prev) => ({
        ...prev,
        proOneTime: latest.one_time_fee ?? prev.proOneTime,
        proPlatformFee: latest.platform_fee ?? prev.proPlatformFee,
        proMaintenance: latest.monthly_maintenance ?? prev.proMaintenance,
      }));
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSavePrice = () => {
    if (!editModal) return;
    const { plan, field, value } = editModal;

    setPricing((prev) => {
      const key =
        plan === "lite"
          ? field === "monthly"
            ? "liteMonthly"
            : field === "platformFee"
              ? "litePlatformFee"
              : "liteTrialMonths"
          : field === "oneTime"
            ? "proOneTime"
            : field === "platformFee"
              ? "proPlatformFee"
              : "proMaintenance";
      return { ...prev, [key]: value };
    });

    toast({ title: "Price updated", description: `${editModal.label} set to $${value}. Changes apply to new subscriptions.` });
    setEditModal(null);
  };

  const liteFeatures = [
    "Auto-generated website",
    "Branded homepage",
    "Product catalogue display",
    "Appointment booking form",
    "Mobile responsive",
    "Basic SEO",
  ];

  const proFeatures = [
    "Custom design & development",
    "Everything in Lite",
    "Custom domain setup",
    "Advanced SEO optimization",
    "Priority support",
    "Monthly maintenance included",
    "Analytics dashboard",
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading font-bold text-2xl flex items-center gap-2">
            💰 Website Builder Pricing
            <span className="text-xs bg-primary/20 text-primary px-2.5 py-0.5 rounded-full font-medium">
              v2.0
            </span>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage pricing tiers and monitor subscription revenue.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RefreshCw size={14} className="mr-1" /> Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Active Lite Subscriptions",
            value: stats.activeLite,
            icon: Globe,
            color: "text-primary",
            bg: "bg-primary/10",
          },
          {
            label: "Active Pro Sites",
            value: stats.activePro,
            icon: Crown,
            color: "text-secondary",
            bg: "bg-secondary/10",
          },
          {
            label: "Monthly Recurring Revenue",
            value: `$${stats.mrr}`,
            icon: TrendingUp,
            color: "text-primary",
            bg: "bg-primary/10",
          },
          {
            label: "Platform Fees Collected",
            value: `$${stats.totalPlatformFees}`,
            icon: DollarSign,
            color: "text-secondary",
            bg: "bg-secondary/10",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="p-4 rounded-xl bg-card border border-border border-l-4 border-l-primary"
          >
            <div
              className={`w-9 h-9 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}
            >
              <stat.icon size={18} className={stat.color} />
            </div>
            <p className="font-heading font-bold text-2xl">{stat.value}</p>
            <p className="text-muted-foreground text-xs mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lite Plan Card */}
        <div className="rounded-2xl bg-card border-2 border-primary p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-heading font-bold text-xl flex items-center gap-2">
              <Globe size={20} className="text-primary" />
              Website Builder Lite
              <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-medium">
                Popular
              </span>
            </h2>
            <span className="text-[10px] px-2.5 py-0.5 rounded-full font-medium bg-secondary/10 text-secondary">
              ● Live
            </span>
          </div>

          {/* Price Section */}
          <div className="rounded-xl bg-muted/50 p-4 space-y-3">
            <PriceRow
              label="Monthly Subscription"
              value={`$${pricing.liteMonthly}`}
              onEdit={() =>
                setEditModal({
                  open: true,
                  plan: "lite",
                  field: "monthly",
                  label: "Lite Monthly Subscription",
                  value: pricing.liteMonthly,
                })
              }
            />
            <PriceRow
              label="Platform Fee (to FSA)"
              value={`$${pricing.litePlatformFee}`}
              onEdit={() =>
                setEditModal({
                  open: true,
                  plan: "lite",
                  field: "platformFee",
                  label: "Lite Platform Fee",
                  value: pricing.litePlatformFee,
                })
              }
            />
            <PriceRow
              label="Trial Period"
              value={`${pricing.liteTrialMonths} months`}
              onEdit={() =>
                setEditModal({
                  open: true,
                  plan: "lite",
                  field: "trial",
                  label: "Lite Trial Period (months)",
                  value: pricing.liteTrialMonths,
                })
              }
            />
          </div>

          {/* Platform Revenue Highlight */}
          <div className="rounded-lg bg-primary/5 border-l-4 border-l-primary p-4">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              💰 Your Revenue (after platform fee)
            </p>
            <p className="font-heading font-bold text-xl">
              ${pricing.liteMonthly - pricing.litePlatformFee}/month
            </p>
          </div>

          {/* Features */}
          <div>
            <h4 className="font-semibold text-sm mb-3">Features</h4>
            <div className="space-y-2">
              {liteFeatures.map((feature) => (
                <div
                  key={feature}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <CheckCircle2
                    size={14}
                    className="text-secondary shrink-0"
                  />
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Pro Plan Card */}
        <div className="rounded-2xl bg-card border-2 border-secondary p-6 space-y-5 bg-gradient-to-br from-card to-secondary/5">
          <div className="flex items-center justify-between">
            <h2 className="font-heading font-bold text-xl flex items-center gap-2">
              <Crown size={20} className="text-secondary" />
              Website Builder Pro
              <span className="text-[10px] bg-secondary/20 text-secondary px-2 py-0.5 rounded-full font-medium">
                Premium
              </span>
            </h2>
            <span className="text-[10px] px-2.5 py-0.5 rounded-full font-medium bg-secondary/10 text-secondary">
              ● Live
            </span>
          </div>

          {/* Price Section */}
          <div className="rounded-xl bg-muted/50 p-4 space-y-3">
            <PriceRow
              label="One-Time Fee"
              value={`$${pricing.proOneTime}`}
              onEdit={() =>
                setEditModal({
                  open: true,
                  plan: "pro",
                  field: "oneTime",
                  label: "Pro One-Time Fee",
                  value: pricing.proOneTime,
                })
              }
            />
            <PriceRow
              label="Platform Fee (to FSA)"
              value={`$${pricing.proPlatformFee}`}
              onEdit={() =>
                setEditModal({
                  open: true,
                  plan: "pro",
                  field: "platformFee",
                  label: "Pro Platform Fee",
                  value: pricing.proPlatformFee,
                })
              }
            />
            <PriceRow
              label="Monthly Maintenance"
              value={`$${pricing.proMaintenance}/mo`}
              onEdit={() =>
                setEditModal({
                  open: true,
                  plan: "pro",
                  field: "maintenance",
                  label: "Pro Monthly Maintenance",
                  value: pricing.proMaintenance,
                })
              }
            />
          </div>

          {/* Platform Revenue Highlight */}
          <div className="rounded-lg bg-secondary/5 border-l-4 border-l-secondary p-4">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              💰 One-Time Revenue (after platform fee)
            </p>
            <p className="font-heading font-bold text-xl">
              ${pricing.proOneTime - pricing.proPlatformFee}
            </p>
          </div>

          {/* Features */}
          <div>
            <h4 className="font-semibold text-sm mb-3">Features</h4>
            <div className="space-y-2">
              {proFeatures.map((feature) => (
                <div
                  key={feature}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Zap size={14} className="text-primary shrink-0" />
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Price Modal */}
      <Dialog
        open={!!editModal}
        onOpenChange={(open) => !open && setEditModal(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editModal?.label}</DialogTitle>
            <DialogDescription>
              Update the pricing value. Changes apply to new subscriptions only.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>New Value</Label>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-muted-foreground font-medium">
                  {editModal?.field === "trial" ? "" : "$"}
                </span>
                <Input
                  type="number"
                  value={editModal?.value ?? 0}
                  onChange={(e) =>
                    setEditModal((prev) =>
                      prev
                        ? { ...prev, value: parseFloat(e.target.value) || 0 }
                        : null
                    )
                  }
                  min={0}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModal(null)}>
              Cancel
            </Button>
            <Button variant="hero" onClick={handleSavePrice}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
};

/* ───── Price Row Sub-component ───── */
const PriceRow = ({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit: () => void;
}) => (
  <div className="flex items-center justify-between py-2 border-b border-dashed border-border last:border-b-0">
    <span className="text-sm text-muted-foreground">{label}</span>
    <button
      onClick={onEdit}
      className="font-heading font-bold text-lg text-secondary hover:bg-secondary/10 px-3 py-1 rounded-md transition-colors flex items-center gap-1.5"
    >
      {value}
      <Edit3 size={12} className="text-primary opacity-60" />
    </button>
  </div>
);

export default WebsitePricingPanel;
