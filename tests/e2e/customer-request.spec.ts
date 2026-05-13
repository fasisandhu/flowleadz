import { test, expect } from "@playwright/test";
import { seedTestUsers, cleanupTestData, closeSeedPool } from "./fixtures/seed";

test.beforeAll(async () => { await seedTestUsers(); });
test.afterAll(async () => {
  await cleanupTestData();
  await closeSeedPool();
});

const PWD = "Passw0rd!Test123";

test("customer submits a work request and sees it in the list", async ({ page }) => {
  await page.goto("/login");
  await page.fill("input#email", "customer@e2e.test");
  await page.fill("input#password", PWD);
  await page.click('button:has-text("Sign in")');
  await expect(page).toHaveURL(/\/customer\/dashboard$/);

  await page.click('a:has-text("New work request")');
  await expect(page).toHaveURL(/\/customer\/requests\/new$/);

  await page.fill("input#title", "Test request from E2E");
  await page.fill("textarea#description", "Body text");
  await page.click('button:has-text("Submit request")');

  await expect(page).toHaveURL(/\/customer\/requests\/[^/]+$/);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Test request from E2E")).toBeVisible();
  await expect(page.getByText("Submitted — awaiting review")).toBeVisible();

  await page.click('a:has-text("Requests")');
  await expect(page).toHaveURL(/\/customer\/requests$/);
  await expect(page.getByText("Test request from E2E")).toBeVisible();
});
