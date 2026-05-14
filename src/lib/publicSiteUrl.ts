/**
 * Resolves the public-facing URL for an organization on FYSORA FASHN.
 *
 * If the organization has set a `public_website_url` on their org_websites
 * record (e.g. a custom domain or a linked external site), all outbound links
 * across FYSORA FASHN should route there instead of the native /site/:slug
 * page. Otherwise we fall back to the native page.
 */
export const resolvePublicSiteUrl = (
  slug: string | null | undefined,
  publicWebsiteUrl?: string | null
): string => {
  const url = (publicWebsiteUrl || "").trim();
  if (url) {
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  }
  return `/site/${slug || ""}`;
};

export const isExternalSiteUrl = (url: string): boolean =>
  /^https?:\/\//i.test(url);
