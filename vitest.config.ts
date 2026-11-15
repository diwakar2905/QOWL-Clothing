import { defineConfig } from "vitest/config";
import path from "node:path";

const resolve = { tsconfigPaths: true, alias: { "server-only": path.resolve("tests/support/empty.ts") } };

export default defineConfig({
  test: {
    projects: [
      { resolve, test: { name: "unit", include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"], environment: "node" } },
      {
        resolve,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          setupFiles: ["tests/support/integration-setup.ts"],
          globalSetup: ["tests/support/global-setup.ts"],
          fileParallelism: false,
          testTimeout: 30000,
          hookTimeout: 120000,
        },
      },
    ],
  },
});
