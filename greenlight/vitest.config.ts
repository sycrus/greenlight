import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["lib/**/*.ts", "pipelines/**/*.ts", "functions/**/*.ts"],
    },
  },
  resolve: {
    alias: {
      "@greenlight/lib": path.resolve(__dirname, "lib"),
    },
  },
})
