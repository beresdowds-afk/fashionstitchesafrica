// Website Builder Tier Configuration
// Defines features and limits per plan tier

export interface TierFeatures {
  templates: number;
  pages: number | "unlimited";
  storageMB: number;
  customDomain: boolean;
  ecommerce: boolean;
  analytics: "basic" | "advanced";
  support: "email" | "priority";
  aiGeneration: boolean;
  dragDrop: "basic" | "advanced";
  ssl: boolean;
  hosting: boolean | "premium";
  seoTools: boolean;
  prioritySupport: boolean;
}

export interface TierLimits {
  maxTemplates: number;
  maxPages: number;
  maxStorageMB: number;
  maxProducts: number;
  bandwidthGB: number;
  teamMembers: number;
  customDomains: number;
}

export const TIER_FEATURES: Record<string, TierFeatures> = {
  lite: {
    templates: 5,
    pages: 10,
    storageMB: 500,
    customDomain: false,
    ecommerce: false,
    analytics: "basic",
    support: "email",
    aiGeneration: true,
    dragDrop: "basic",
    ssl: true,
    hosting: true,
    seoTools: false,
    prioritySupport: false,
  },
  pro: {
    templates: 20,
    pages: "unlimited",
    storageMB: 5120,
    customDomain: true,
    ecommerce: true,
    analytics: "advanced",
    support: "priority",
    aiGeneration: true,
    dragDrop: "advanced",
    ssl: true,
    hosting: "premium",
    seoTools: true,
    prioritySupport: true,
  },
};

export const TIER_LIMITS: Record<string, TierLimits> = {
  lite: {
    maxTemplates: 5,
    maxPages: 10,
    maxStorageMB: 500,
    maxProducts: 0,
    bandwidthGB: 10,
    teamMembers: 1,
    customDomains: 0,
  },
  pro: {
    maxTemplates: 20,
    maxPages: 999,
    maxStorageMB: 5120,
    maxProducts: 100,
    bandwidthGB: 100,
    teamMembers: 5,
    customDomains: 3,
  },
};

export function getTierFeatures(tier: string): TierFeatures {
  return TIER_FEATURES[tier] || TIER_FEATURES.lite;
}

export function getTierLimits(tier: string): TierLimits {
  return TIER_LIMITS[tier] || TIER_LIMITS.lite;
}

export function canAccessFeature(tier: string, feature: keyof TierFeatures): boolean {
  const features = getTierFeatures(tier);
  return features[feature] === true;
}

export interface UsageData {
  catalogueItems: number;
  // Future: pages, storageMB, etc.
}

export function getUsagePercentages(tier: string, usage: UsageData) {
  const limits = getTierLimits(tier);
  return {
    products: limits.maxProducts === 0 ? 100 : Math.min(100, (usage.catalogueItems / limits.maxProducts) * 100),
    pages: limits.maxPages === 999 ? 0 : 0, // Not tracked yet
    storage: 0, // Not tracked yet
  };
}
