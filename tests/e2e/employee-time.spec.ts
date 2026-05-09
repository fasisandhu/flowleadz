import { test, expect } from "@playwright/test";
import { seedTestUsers, cleanupTestData, closeSeedPool } from "./fixtures/seed";

test.beforeAll(async () => { await seedTestUsers(); });
test.afterAll(async () => {
  await cleanupTestData();
  await closeSeedPool();
});

const PWD = "Passw0rd!Test123";

test("employee logs time on a task and sees it in My time", async ({ page }) => {
  await page.goto("/login");
  await page.fill("input#email", "employee@e2e.test");
  await page.fill("input#password", PWD);
  await page.click('button:has-text("Sign in")');
  await expect(page).toHaveURL(/\/employee\/dashboard$/, { timeout: 15_000 });

  // Click "Log time" on the dashboard (uses the first active project).
  await page.click('a:has-text("Log time")');
  await expect(page).toHaveURL(/\/employee\/projects\/[^/]+\/time\/new$/);

  // Fill the form. Task picker auto-selects the first task.
  await page.fill("input#minutes", "45");
  await page.fill("textarea#note", "E2E logged time");
  await page.click('button:has-text("Log time")');

  // Lands on project detail.
  await expect(page).toHaveURL(/\/employee\/projects\/[^/]+$/, { timeout: 15_000 });

  // Navigate to My time — hard navigation to ensure a fresh server render.
  await page.goto("/employee/time");
  await expect(page).toHaveURL(/\/employee\/time$/);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("45m")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("E2E logged time")).toBeVisible();
});
