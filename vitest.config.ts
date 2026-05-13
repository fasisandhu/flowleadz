import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["tests/fixtures/email-dispatch-mock.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests/e2e/**", "node_modules/**", ".next/**"],
    globals: false,
    pool: "forks",
    sequence: { concurrent: false },
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // "server-only" is a Next.js guard that throws when imported outside the
      // server bundle. In Vitest (Node, no Next bundler) the package does not
      // exist, so alias it to an empty module so service files that carry the
      // guard can still be imported in unit tests.
      "server-only": path.resolve(__dirname, "tests/fixtures/server-only-stub.ts"),
    },
  },
});
