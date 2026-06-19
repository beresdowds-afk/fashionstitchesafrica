import type { InsuranceConfig, RiskScore } from "./types";
import { getTier } from "./premium";

export interface TailorMetrics {
  completionRate: number; // 0..1
  rating: number;         // 1..5
  disputeCount: number;
  totalOrders: number;
  experienceYears: number;
  onTimeRate: number;     // 0..1
}

/**
 * Risk score formula (per spec):
 *   completion 35% + rating 25% + disputes 20% + experience 10% + timeliness 10%.
 * Higher score = better/lower risk. Clamped to 0..100.
 */
export function scoreFromMetrics(m: TailorMetrics, cfg: InsuranceConfig): RiskScore {
  const completionScore = ((m.completionRate - 0.7) * 100) / 0.3;
  const ratingScore = (m.rating - 3) * 33.3;
  const disputeScore = m.totalOrders > 0
    ? 100 - (m.disputeCount / m.totalOrders) * 100
    : 100;
  const experienceScore = Math.min(m.experienceYears * 10, 100);
  const timelinessScore = m.onTimeRate * 100;

  const weighted =
    completionScore * 0.35 +
    ratingScore * 0.25 +
    disputeScore * 0.20 +
    experienceScore * 0.10 +
    timelinessScore * 0.10;

  // Convert "performance" into "risk" — invert so high performance = low risk.
  // Per UI tiers, score 0–30 = low risk, etc. So we use 100 - performance.
  const rawPerf = Math.min(Math.max(Math.round(weighted), 0), 100);
  const score = 100 - rawPerf;
  const tier = getTier(score, cfg);

  return {
    score,
    tier,
    factors: {
      completionRate: m.completionRate,
      rating: m.rating,
      disputeCount: m.disputeCount,
      experienceYears: m.experienceYears,
      onTimeRate: m.onTimeRate,
    },
  };
}

/** Neutral default when we have no data on a tailor yet. */
export function defaultRiskScore(cfg: InsuranceConfig): RiskScore {
  return {
    score: cfg.risk_threshold_low + 1, // just above "low" = medium tier
    tier: "medium",
    factors: {},
  };
}