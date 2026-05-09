import { test, expect } from "@playwright/test";
import { seedTestUsers, cleanupTestData, closeSeedPool } from "./fixtures/seed";

test.beforeAll(async () => { await seedTestUsers(); });
test.afterAll(async () => {
  await cleanupTestData();
  await closeSeedPool();
});

const PWD = "Passw0rd!Test123";

test("admin accepts a work request and a task is created", async ({ page }) => {
  await page.goto("/login");
  await page.fill("input#email", "admin@e2e.test");
  await page.fill("input#password", PWD);
  await page.click('button:has-text("Sign in")');

  // After sign-in, /admin/dashboard redirects to /admin/orgs/<id>/dashboard.
  await expect(page).toHaveURL(/\/admin\/orgs\/[^/]+\/dashboard$/, { timeout: 15_000 });

  // Navigate to work requests (filter defaults to 'submitted').
  await page.click('a:has-text("Work requests")');
  await expect(page).toHaveURL(/\/admin\/orgs\/[^/]+\/work-requests/);

  // Open the seeded request.
  await page.click('a:has-text("E2E request to accept")');
  await expect(page).toHaveURL(/\/admin\/orgs\/[^/]+\/work-requests\/[^/]+$/);

  // Click "Accept request" (no project selected — task will be created stand-alone).
  await page.click('button:has-text("Accept request")');

  // The page refreshes and the review bar shows "Already accepted."
  await expect(page.getByText(/Already accepted/i)).toBeVisible({ timeout: 10_000 });
});
