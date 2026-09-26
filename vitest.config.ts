import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Vision uses node:test and runs separately through test:vision.
    exclude: [...configDefaults.exclude, "packages/vision/**"],
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
  },
});
