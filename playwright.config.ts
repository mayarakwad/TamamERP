import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a dev server on port 3200 with a freshly
// seeded database. First time on a new machine: npx playwright install chromium
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://localhost:3200", trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run db:seed && npx next dev -p 3200",
    url: "http://localhost:3200/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
