import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Runs the installation wizard on an empty server, then restores the demo
// data so the other specs find what they expect.
test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  execSync("npx tsx scripts/reset-fresh.ts --yes", { stdio: "ignore" });
});

test.afterAll(() => {
  execSync("npx tsx prisma/seed.ts", { stdio: "ignore" });
});

test("a fresh server walks through the setup wizard and locks it afterwards", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole("button", { name: /Continue/ })).toBeDisabled();

  const key = readFileSync("data/setup-key.txt", "utf8").trim();
  await page.locator("#setup-key").fill(key);
  await page.getByRole("button", { name: /Unlock/ }).click();
  await expect(page.getByText("Database connected")).toBeVisible();
  await page.getByRole("button", { name: /Continue/ }).click();

  await page.locator("#instanceName").fill("Doha Test ERP");
  await page.getByRole("button", { name: /Continue/ }).click();

  await page.locator("#a-name").fill("Test Admin");
  await page.locator("#a-email").fill("admin@example.com");
  await page.locator("#a-password").fill("Doha-2026-pearl");
  await page.locator("#a-confirm").fill("Doha-2026-pearl");
  await page.getByRole("button", { name: /Continue/ }).click();

  await page.getByRole("button", { name: /^Home/ }).click();
  await page.locator("#w-name").fill("Test Household");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click(); // start clean
  await page.getByRole("button", { name: /Install Tamam/ }).click();

  await expect(page.getByText("Doha Test ERP is ready")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Open your dashboard/ }).click();
  await expect(page).toHaveURL(/\/w\/test-household$/);
  await expect(page).toHaveTitle(/Doha Test ERP/);

  await page.goto(`/setup?key=${key}`);
  await expect(page.getByText("already installed")).toBeVisible();

  // Sign-ups default to closed; no demo accounts on a clean install.
  await page.context().clearCookies();
  await page.goto("/login");
  await expect(page.getByText("Create a workspace")).toHaveCount(0);
  await expect(page.getByText("Explore the demo")).toHaveCount(0);
});
