/**
 * Passkey enrollment + authentication end-to-end test.
 *
 * Uses Chrome DevTools Protocol's Virtual Authenticator so the browser can
 * complete WebAuthn ceremonies without a real Face ID / security-key device.
 *
 * Requires the tester to be signed in — set PLAYWRIGHT_TEST_EMAIL and
 * PLAYWRIGHT_TEST_PASSWORD in the environment, or wire in your own auth
 * setup. If those env vars are missing the test is skipped.
 */
import { test, expect, type CDPSession, type Page } from "@playwright/test";

const EMAIL = process.env.PLAYWRIGHT_TEST_EMAIL ?? "";
const PASSWORD = process.env.PLAYWRIGHT_TEST_PASSWORD ?? "";

async function installVirtualAuthenticator(page: Page): Promise<CDPSession> {
  const client = await page.context().newCDPSession(page);
  await client.send("WebAuthn.enable");
  await client.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return client;
}

async function signInWithEmailPassword(page: Page) {
  await page.goto("/auth");
  await page.getByLabel(/email/i).first().fill(EMAIL);
  await page.getByLabel(/password/i).first().fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });
}

test.describe("Passkey enrollment + sign-in", () => {
  test.skip(!EMAIL || !PASSWORD, "Set PLAYWRIGHT_TEST_EMAIL / PLAYWRIGHT_TEST_PASSWORD to run");

  test("enroll a passkey, then verify it on the same device", async ({ page }) => {
    const cdp = await installVirtualAuthenticator(page);

    await signInWithEmailPassword(page);
    await page.goto("/account/security");
    await expect(page.getByRole("heading", { name: /account.*security/i })).toBeVisible();

    // Enroll
    await page.getByTestId("passkey-nickname").fill("Playwright virtual authenticator");
    await page.getByTestId("passkey-enroll").click();

    // Sonner success toast
    await expect(page.getByText(/passkey enrolled on this device/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("passkey-item")).toHaveCount(1);

    // Verify (test authentication ceremony)
    await page.getByTestId("passkey-test").click();
    await expect(page.getByText(/passkey verified/i)).toBeVisible({ timeout: 15_000 });

    // Cleanup: virtual authenticator is torn down when the browser context closes.
    await cdp.detach().catch(() => {});
  });
});