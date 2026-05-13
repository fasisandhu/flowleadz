import { test, expect } from "@playwright/test";
import { seedTestUsers, cleanupTestData, closeSeedPool } from "./fixtures/seed";

const PWD = "Passw0rd!Test123";

test.beforeAll(async () => {
  await seedTestUsers();
});

test.afterAll(async () => {
  await cleanupTestData();
  await closeSeedPool();
});

test("admin signs in and lands on the admin dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.fill("input#email", "admin@e2e.test");
  await page.fill("input#password", PWD);
  await page.click('button:has-text("Sign in")');
  // /admin/dashboard immediately redirects to /admin/orgs/<id>/dashboard.
  await expect(page).toHaveURL(/\/admin\/orgs\/[^/]+\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("employee signs in and lands on the employee dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.fill("input#email", "employee@e2e.test");
  await page.fill("input#password", PWD);
  await page.click('button:has-text("Sign in")');
  await expect(page).toHaveURL(/\/employee\/dashboard$/);
});

test("customer signs in and lands on the customer dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.fill("input#email", "customer@e2e.test");
  await page.fill("input#password", PWD);
  await page.click('button:has-text("Sign in")');
  await expect(page).toHaveURL(/\/customer\/dashboard$/);
});

test("customer cannot access /admin/dashboard (redirected to own dashboard)", async ({ page }) => {
  // Sign in as customer first.
  await page.goto("/login");
  await page.fill("input#email", "customer@e2e.test");
  await page.fill("input#password", PWD);
  await page.click('button:has-text("Sign in")');
  await expect(page).toHaveURL(/\/customer\/dashboard$/);

  // Now try to navigate to the admin dashboard.
  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/\/customer\/dashboard$/);
});
