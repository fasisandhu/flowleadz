import { test, expect } from "@playwright/test";
import { seedTestUsers, cleanupTestData, closeSeedPool } from "./fixtures/seed";

test.beforeAll(async () => { await seedTestUsers(); });
test.afterAll(async () => {
  await cleanupTestData();
  await closeSeedPool();
});

const PWD = "Passw0rd!Test123";

const VIEWPORTS = [
  { width: 375, height: 667, label: "mobile" },
  { width: 768, height: 1024, label: "tablet" },
  { width: 1024, height: 768, label: "laptop" },
];

for (const vp of VIEWPORTS) {
  test(`employee sign-in flow at ${vp.label} (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/login");
    await page.fill("input#email", "employee@e2e.test");
    await page.fill("input#password", PWD);
    await page.click('button:has-text("Sign in")');
    await expect(page).toHaveURL(/\/employee\/dashboard$/);

    if (vp.width < 768) {
      // Mobile: hamburger visible, desktop nav hidden.
      const hamburger = page.getByLabel("Open menu");
      await expect(hamburger).toBeVisible();
      await hamburger.click();
      await expect(page.getByRole("link", { name: /My tasks/ })).toBeVisible();
    } else {
      // Tablet/laptop: desktop nav visible directly.
      await expect(page.getByRole("link", { name: /My tasks/ })).toBeVisible();
    }
  });
}
