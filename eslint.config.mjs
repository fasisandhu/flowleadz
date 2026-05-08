import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/lib/db/client",
                "@/lib/db/schema",
                "@/lib/db/schema/*",
              ],
              message:
                "Direct DB access is forbidden outside lib/services and lib/db. Go through a service function.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "lib/services/**",
      "lib/db/**",
      "lib/better-auth/**",
      "tests/fixtures/**",
      "tests/integration/**",
    ],
    rules: { "no-restricted-imports": "off" },
  },
  {
    ignores: [
      "lib/db/migrations/**",
      ".next/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
