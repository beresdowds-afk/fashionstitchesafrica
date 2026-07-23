import { test, expect } from "@playwright/test";

/**
 * E2E: enable the site-wide size chart in the Website Builder and verify the
 * UK / US / EU / CN conversion table renders on the public OrgWebsite page.
 *
 * Requires an authenticated org_admin session and a resolvable org slug.
 * Set the following env vars in CI to enable this test — otherwise it is
 * skipped so the suite stays green on unseeded environments:
 *   E2E_ORG_ADMIN_STORAGE_STATE  Path to Playwright storageState.json for an
 *                                org admin whose org owns the target website.
 *   E2E_ORG_SLUG                 Public slug of that organization (used to
 *                                open /site/<slug>).
 */

const storageState = process.env.E2E_ORG_ADMIN_STORAGE_STATE;
const orgSlug = process.env.E2E_ORG_SLUG;
const shouldRun = Boolean(storageState && orgSlug);

test.describe("Site-wide size chart", () => {
  test.skip(!shouldRun, "Set E2E_ORG_ADMIN_STORAGE_STATE and E2E_ORG_SLUG to run");

  test.use({ storageState: storageState ?? undefined });

  test("builder toggle publishes UK/US/EU/CN chart to public site", async ({ page }) => {
    // 1. Open the Website Builder → Branding section
    await page.goto("/dashboard?section=branding");
    await page.getByRole("button", { name: /branding/i }).first().click().catch(() => {});

    // 2. Enable the Size Chart toggle
    const toggle = page.getByRole("switch", { name: /size chart/i })
      .or(page.locator('[aria-label*="size chart" i][role="switch"]'))
      .first();
    await expect(toggle).toBeVisible({ timeout: 15_000 });
    if ((await toggle.getAttribute("aria-checked")) !== "true") {
      await toggle.click();
    }

    // 3. Ensure UK, US, EU, CN are all selected
    for (const std of ["UK", "US", "EU", "CN"]) {
      const chip = page.getByRole("button", { name: new RegExp(`^${std}$`) }).first();
      const pressed = await chip.getAttribute("aria-pressed").catch(() => null);
      if (pressed === "false") await chip.click();
    }

    // 4. Save
    await page.getByRole("button", { name: /save/i }).first().click();
    await expect(page.getByText(/website settings saved/i)).toBeVisible({ timeout: 15_000 });

    // 5. Visit public site and assert the chart is rendered with all four headers
    await page.goto(`/site/${orgSlug}`);
    const heading = page.getByRole("heading", { name: /size chart/i });
    await expect(heading).toBeVisible({ timeout: 15_000 });
    for (const std of ["UK", "US", "EU", "CN"]) {
      await expect(page.getByRole("columnheader", { name: std }).first()).toBeVisible();
    }
  });
});