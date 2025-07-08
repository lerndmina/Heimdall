import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Test files location
    include: ["tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],

    // Environment setup
    environment: "node",

    // Global test timeout
    testTimeout: 30000,

    // Enable watch mode for interactive testing
    watch: true,

    // Reporter configuration
    reporters: ["verbose"],

    // Coverage configuration (optional)
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "tests/"],
    },

    // Global setup and teardown
    globals: true,

    // Environment variables setup
    env: {
      NODE_ENV: "test",
    },
  },

  // Resolve configuration for imports
  resolve: {
    alias: {
      "@": "./src",
    },
  },
});
