import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: [],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests/e2e/**", "node_modules/**", ".next/**"],
    globals: false,
    pool: "forks",
    sequence: { concurrent: false },
    testTimeout: 15000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
