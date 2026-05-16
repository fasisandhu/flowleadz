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
  await expect(page).toHaveURL(/\/employee\/dashboard$/);

  // Navigate to My tasks (the dashboard no longer has a "Log time" quick link).
  await page.click('a:has-text("My tasks")');
  await expect(page).toHaveURL(/\/employee\/tasks/);

  // Open the seeded "E2E task".
  await page.click('text=E2E task');
  await expect(page).toHaveURL(/\/employee\/tasks\/[^/]+$/);

  // Open the "Log time" inline composer in the task action bar.
  await page.click('button:has-text("Log time")');

  // Fill the inline form. Field ids come from log-time-inline-form.tsx.
  await page.fill("input#log-minutes", "45");
  await page.fill("input#log-note", "E2E logged time");

  // Submit. Differentiate the submit button from the action-bar toggle.
  await page.click('button[type="submit"]:has-text("Log time")');

  // Wait for the form to close (TaskActionBar resets mode to "none" on success,
  // which unmounts the inline log-time form). Without this we race the
  // navigation against the in-flight server action and miss the new row.
  await expect(page.locator("input#log-minutes")).toHaveCount(0);

  // Navigate to My time. Hard navigation to ensure a fresh server render.
  await page.goto("/employee/time");
  await expect(page).toHaveURL(/\/employee\/time$/);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("45m")).toBeVisible();
  await expect(page.getByText("E2E logged time")).toBeVisible();
});
