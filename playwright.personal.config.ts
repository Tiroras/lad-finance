import { defineConfig } from "@playwright/test";
import demoConfig from "./playwright.config";

export default defineConfig({
  ...demoConfig,
  testMatch: [
    "**/demo-disabled.spec.ts",
    "**/profiles.spec.ts",
    "**/first-run.spec.ts",
    "**/learning.spec.ts",
  ],
  testIgnore: [],
  outputDir: "test-results/personal",
  reporter: process.env.CI
    ? [
        ["list"],
        ["html", { open: "never", outputFolder: "playwright-report/personal" }],
      ]
    : "list",
  use: {
    ...demoConfig.use,
    baseURL: "http://localhost:8089",
  },
  webServer: {
    command:
      "EXPO_PUBLIC_ENABLE_DEMO=false EXPO_PUBLIC_RESET_ON_START=false EXPO_OFFLINE=1 CI=1 npx expo start --web --host localhost --port 8089",
    url: "http://localhost:8089",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
