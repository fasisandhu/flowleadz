import { test, expect } from "@playwright/test";
import { seedTestUsers, cleanupTestData, closeSeedPool } from "./fixtures/seed";

test.beforeAll(async () => { await seedTestUsers(); });
test.afterAll(async () => {
  await cleanupTestData();
  await closeSeedPool();
});

const PWD = "Passw0rd!Test123";

test("employee opens task detail and posts an update", async ({ page }) => {
  await page.goto("/login");
  await page.fill("input#email", "employee@e2e.test");
  await page.fill("input#password", PWD);
  await page.click('button:has-text("Sign in")');
  await expect(page).toHaveURL(/\/employee\/dashboard$/);

  // Open My tasks page (seeded with one "E2E task").
  await page.click('a:has-text("My tasks")');
  await expect(page).toHaveURL(/\/employee\/tasks/);

  // Click the seeded task card.
  await page.click('text=E2E task');
  await expect(page).toHaveURL(/\/employee\/tasks\/[^/]+$/);

  // Activity feed renders empty state initially.
  await expect(page.getByText(/No activity yet/i)).toBeVisible();

  // Open "Post update" composer.
  await page.click('button:has-text("Post update")');
  await page.fill("textarea#update-body", "First update from the task detail");
  await page.click('button:has-text("Post update")');

  // New update appears in the feed.
  await expect(page.getByText("First update from the task detail")).toBeVisible();
});
