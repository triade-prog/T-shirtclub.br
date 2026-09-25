import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  globalIgnores(["**/.next/**", "**/node_modules/**", "**/next-env.d.ts", "supabase/functions/**", "test-results/**", "playwright-report/**"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["apps/**/*.{ts,tsx}", "packages/ui/**/*.{ts,tsx}"],
    extends: [...nextVitals, ...nextTs],
    settings: { next: { rootDir: ["apps/web/", "apps/admin/"] }, react: { version: "19" } },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: ["*.cjs"],
    languageOptions: { sourceType: "commonjs", globals: { module: "writable", require: "readonly" } },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: { console: "readonly", process: "readonly" } },
  },
]);
