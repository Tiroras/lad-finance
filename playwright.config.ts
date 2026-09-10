import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:8087",
    viewport: { width: 390, height: 844 },
    locale: "ru-RU",
    timezoneId: "Europe/Samara",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "EXPO_OFFLINE=1 CI=1 npx expo start --web --host localhost --port 8087",
    url: "http://localhost:8087",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
