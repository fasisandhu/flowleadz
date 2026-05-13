import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  // Per-test timeout. Dev-mode first-compile of multi-route redirect chains
  // (e.g. / → /admin/dashboard → /admin/orgs/[id]/dashboard) can take ~30-90s
  // on a cold .next cache. Set generously so the test only fails on real bugs.
  timeout: 180_000,
  expect: {
    // Each .toHaveURL / .toBeVisible default — same reasoning as above.
    timeout: 60_000,
  },
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    env: { NEXT_PRIVATE_NO_TURBOPACK: "1" },
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
