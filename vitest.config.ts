import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Vision uses node:test and runs separately through test:vision.
    exclude: [...configDefaults.exclude, "packages/vision/src/*.test.ts"],
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    // packages/vision uses node:test (npm run test:vision).
    exclude: ["**/node_modules/**", "packages/vision/**"],
  },
});
