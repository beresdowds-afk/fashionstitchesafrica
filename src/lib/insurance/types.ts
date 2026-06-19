/**
 * FYSORA Order Protection — shared types.
 */
export type InsurancePolicyType = "order_protection" | "contract_assurance";
export type InsurancePolicyStatus = "active" | "claimed" | "expired" | "cancelled";
export type InsuranceClaimType =
  | "delivery_failure"
  | "wrong_item"
  | "quality_issue"
  | "measurement_error"
  | "fraud"
  | "non_delivery";
export type InsuranceClaimStatus =
  | "submitted"
  | "reviewing"
  | "approved"
  | "partial_approved"
  | "rejected"
  | "paid"
  | "expired"
  | "cancelled";
export type InsuranceRiskTier = "low" | "medium" | "high" | "very_high";

export type InsuranceFlagKey =
  | "order_protection"
  | "escrow_protection"
  | "risk_engine"
  | "contract_insurance"
  | "ai_measurement_guarantee"
  | "insurer_partner";

export interface InsuranceFlag {
  id: string;
  flag_key: InsuranceFlagKey;
  flag_name: string;
  description: string | null;
  enabled: boolean;
  phase: number;
  configuration: Record<string, unknown>;
  updated_at: string;
  updated_by: string | null;
}

export interface InsuranceConfig {
  id: 1;
  fee_min_percent: number;
  fee_max_percent: number;
  reserve_percent: number;
  administration_percent: number;
  platform_percent: number;
  claims_window_days: number;
  min_order_value: number;
  max_coverage_per_claim: number;
  default_excess: number;
  risk_threshold_low: number;
  risk_threshold_medium: number;
  risk_threshold_high: number;
  fee_multiplier_low: number;
  fee_multiplier_medium: number;
  fee_multiplier_high: number;
  fee_multiplier_very_high: number;
  updated_at: string;
}

export interface RiskScore {
  score: number;
  tier: InsuranceRiskTier;
  factors: {
    completionRate?: number;
    rating?: number;
    disputeCount?: number;
    experienceYears?: number;
    onTimeRate?: number;
  };
}

export interface PremiumQuote {
  premium: number;
  coverageLimit: number;
  rate: number;
  riskScore: number;
  riskTier: InsuranceRiskTier;
  excess: number;
  currency: string;
}