import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    // packages/vision uses node:test (npm run test:vision).
    exclude: ["**/node_modules/**", "packages/vision/**"],
  },
});
