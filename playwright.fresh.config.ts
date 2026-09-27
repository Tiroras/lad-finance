import { defineConfig } from "@playwright/test";
import personalConfig from "./playwright.personal.config";

export default defineConfig({
  ...personalConfig,
  testMatch: "**/fresh-start.spec.ts",
  outputDir: "test-results/fresh",
  reporter: "list",
  use: { ...personalConfig.use, baseURL: "http://localhost:8093" },
  webServer: {
    command:
      "EXPO_PUBLIC_ENABLE_DEMO=false EXPO_OFFLINE=1 CI=1 npm run web:fresh -- --host localhost --port 8093",
    url: "http://localhost:8093",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
