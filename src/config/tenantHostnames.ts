/**
 * Static tenant → org-slug mapping.
 *
 * Used as a synchronous fallback by `useCustomHostname` when the DB resolver
 * is slow, offline, or returns no match — so a freshly-pointed custom domain
 * still lands on the correct org website without a round-trip.
 *
 * Extend this list as new tenants are onboarded with custom domains.
 */
export interface TenantHostname {
  host: string;
  slug: string;
  name: string;
  org_id?: string;
}

export const TENANT_HOSTNAMES: TenantHostname[] = [
  {
    host: "gabulkfashionstudio.org.ng",
    slug: "gabulk-fashion-studio",
    name: "GABULK FASHION STUDIO",
  },
  {
    host: "www.gabulkfashionstudio.org.ng",
    slug: "gabulk-fashion-studio",
    name: "GABULK FASHION STUDIO",
  },
];

export const lookupTenantHost = (host: string): TenantHostname | null =>
  TENANT_HOSTNAMES.find(t => t.host.toLowerCase() === host.toLowerCase()) ?? null;
