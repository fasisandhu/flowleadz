import { test, expect } from "@playwright/test";
import { seedTestUsers, cleanupTestData, closeSeedPool } from "./fixtures/seed";

test.beforeAll(async () => { await seedTestUsers(); });
test.afterAll(async () => {
  await cleanupTestData();
  await closeSeedPool();
});

const PWD = "Passw0rd!Test123";

test("customer attaches a file to a work request", async ({ page }) => {
  // Skip when R2 is not configured (no credentials in test env).
  test.skip(!process.env.R2_BUCKET, "R2_BUCKET not configured — skipping attachment E2E");

  await page.goto("/login");
  await page.fill("input#email", "customer@e2e.test");
  await page.fill("input#password", PWD);
  await page.click('button:has-text("Sign in")');
  await expect(page).toHaveURL(/\/customer\/dashboard$/, { timeout: 15_000 });

  await page.click('a:has-text("New work request")');
  await page.fill("input#title", "Request with attachment");
  await page.fill("textarea#description", "See attached file");
  await page.click('button:has-text("Submit request")');

  // Lands on the detail page.
  await expect(page).toHaveURL(/\/customer\/requests\/[^/]+$/, { timeout: 15_000 });
  await expect(page.getByText("Request with attachment")).toBeVisible();

  // Upload a small text file via the AttachmentUpload widget.
  const fileInput = page.locator("input[type='file']");
  await fileInput.setInputFiles({
    name: "evidence.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Hello from E2E", "utf-8"),
  });

  // After successful upload + confirm + router.refresh(), the AttachmentList re-renders with the file.
  await expect(page.getByText("evidence.txt")).toBeVisible({ timeout: 30_000 });
});
