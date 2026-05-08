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
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db/client",
              message:
                "Direct DB access is forbidden outside lib/services and lib/db. Go through a service function.",
            },
          ],
          patterns: [
            {
              group: ["@/lib/db/client", "@/lib/db/schema/*"],
              message:
                "Direct DB access is forbidden outside lib/services and lib/db.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["lib/services/**", "lib/db/**", "tests/**"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    ignores: ["lib/db/migrations/**", ".next/**", "node_modules/**", "playwright-report/**", "test-results/**"],
  },
];

export default eslintConfig;
