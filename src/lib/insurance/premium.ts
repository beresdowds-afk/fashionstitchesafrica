import type { InsuranceConfig, InsuranceRiskTier, PremiumQuote, RiskScore } from "./types";

/** Compute risk tier from a 0–100 score using configured thresholds. */
export function getTier(score: number, cfg: InsuranceConfig): InsuranceRiskTier {
  if (score <= cfg.risk_threshold_low) return "low";
  if (score <= cfg.risk_threshold_medium) return "medium";
  if (score <= cfg.risk_threshold_high) return "high";
  return "very_high";
}

/** Base rate (as a decimal fraction of order value, e.g. 0.025 = 2.5%) for a tier. */
export function getBaseRate(tier: InsuranceRiskTier, cfg: InsuranceConfig): number {
  // Scale base rate across the configured fee min/max by tier.
  const span = cfg.fee_max_percent - cfg.fee_min_percent;
  const tierFraction: Record<InsuranceRiskTier, number> = {
    low: 0,
    medium: 0.33,
    high: 0.66,
    very_high: 1,
  };
  const pct = cfg.fee_min_percent + span * tierFraction[tier];
  return pct / 100;
}

/** Coverage limit capped at configured max. Defaults to full order value. */
export function getCoverageLimit(orderValue: number, cfg: InsuranceConfig): number {
  return Math.min(orderValue, cfg.max_coverage_per_claim);
}

/** Default excess/deductible (currently a flat configured amount). */
export function getExcess(_orderValue: number, cfg: InsuranceConfig): number {
  return cfg.default_excess;
}

/** Calculate a premium quote for an order. */
export function calculatePremium(args: {
  orderValue: number;
  risk: RiskScore;
  config: InsuranceConfig;
  currency?: string;
}): PremiumQuote {
  const { orderValue, risk, config, currency = "NGN" } = args;
  const baseRate = getBaseRate(risk.tier, config);
  const multiplier =
    risk.tier === "low" ? config.fee_multiplier_low
    : risk.tier === "medium" ? config.fee_multiplier_medium
    : risk.tier === "high" ? config.fee_multiplier_high
    : config.fee_multiplier_very_high;

  // Small volume discount for large orders.
  const volumeDiscount = orderValue > 100_000 ? 0.05 : 0;

  const premium = Math.max(
    0,
    Math.round(orderValue * baseRate * multiplier * (1 - volumeDiscount)),
  );

  return {
    premium,
    coverageLimit: getCoverageLimit(orderValue, config),
    rate: baseRate * multiplier,
    riskScore: risk.score,
    riskTier: risk.tier,
    excess: getExcess(orderValue, config),
    currency,
  };
}

/** Whether an order qualifies for protection per current config. */
export function isEligible(orderValue: number, cfg: InsuranceConfig): boolean {
  return orderValue >= cfg.min_order_value;
}