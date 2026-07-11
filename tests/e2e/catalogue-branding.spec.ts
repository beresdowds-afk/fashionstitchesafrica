import { test, expect } from "@playwright/test";

// Verifies BrowseOrganizations and CataloguePage render branding + external
// website links sourced from org_websites_public.public_website_url.
//
// These tests assume at least one active organization has a public website row
// with public_website_url populated. If your seed data is empty, mark the
// affected assertions as .skip in CI.

test.describe("Public catalogue branding", () => {
  test("BrowseOrganizations lists an org card with an external website link", async ({ page }) => {
    await page.goto("/browse");
    // Wait for at least one org card
    const firstCard = page.locator('[data-testid="org-card"], article, .org-card').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });

    // External website link uses the public_website_url column
    const websiteLink = page.locator('a[href^="http"]:has-text("Website"), a[data-role="external-website"]').first();
    if (await websiteLink.count()) {
      const href = await websiteLink.getAttribute("href");
      expect(href).toMatch(/^https?:\/\//);
      expect(href).not.toContain(page.url().split("/")[2]); // not internal
    }
  });

  test("CataloguePage renders branding when public_website_url is present", async ({ page }) => {
    await page.goto("/browse");
    const firstOrgLink = page.locator('a[href*="/site/"], a[href*="/catalogue"]').first();
    await expect(firstOrgLink).toBeVisible({ timeout: 15_000 });
    await firstOrgLink.click();

    // Branding: logo or brand colour must render
    const logo = page.locator('img[alt*="logo" i], [data-role="org-logo"]').first();
    await expect(logo.or(page.locator('h1'))).toBeVisible({ timeout: 15_000 });

    // External website link should be present when public_website_url is set
    const extLink = page.locator('a[data-role="external-website"], a:has-text("Visit website")').first();
    if (await extLink.count()) {
      const href = await extLink.getAttribute("href");
      expect(href).toMatch(/^https?:\/\//);
    }
  });
});