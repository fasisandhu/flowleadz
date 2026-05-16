import { test, expect } from "@playwright/test";
import { seedTestUsers, cleanupTestData, closeSeedPool } from "./fixtures/seed";

test.beforeAll(async () => { await seedTestUsers(); });
test.afterAll(async () => {
  await cleanupTestData();
  await closeSeedPool();
});

const PWD = "Passw0rd!Test123";

test("admin searches and finds the seeded work request", async ({ page }) => {
  await page.goto("/login");
  await page.fill("input#email", "admin@e2e.test");
  await page.fill("input#password", PWD);
  await page.click('button:has-text("Sign in")');
  await expect(page).toHaveURL(/\/admin\/orgs\/[^/]+\/dashboard$/);

  await page.focus('input[aria-label="Search"]');
  await page.keyboard.type("E2E request");
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/admin\/orgs\/[^/]+\/search\?q=/);
  await expect(page.getByText(/E2E request to accept/i).first()).toBeVisible();
});
