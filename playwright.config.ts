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
    // Use production build for E2E — dev mode's HMR pipeline crashes on Node 24
    // ("Jest worker encountered N child process exceptions"). Production mode
    // is also faster per-request and exercises the same code path that ships.
    // DISABLE_RATE_LIMIT must be 1 in .env to suppress Better Auth's prod
    // rate limiter (Plan 3c Task 10).
    command: "pnpm build && pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
