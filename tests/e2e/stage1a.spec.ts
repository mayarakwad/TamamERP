import { expect, test, type Page } from "@playwright/test";

async function loginAs(page: Page, who: RegExp) {
  await page.goto("/login");
  // The first chip for a person opens their main workspace (Hessa also appears as a school parent).
  await page.getByRole("button", { name: who }).first().click();
  await page.waitForURL(/\/w\//);
}

test("signed-out visitors go to sign in and come back afterwards", async ({ page }) => {
  await page.goto("/w/al-mansouri-home/settings/appearance");
  await expect(page).toHaveURL(/\/login\?next=%2Fw%2Fal-mansouri-home%2Fsettings%2Fappearance/);
  await page.locator("#email").fill("hessa@tamam.demo");
  await page.locator("#password").fill("demo1234");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/appearance$/);
});

test("the Home dashboard is alive with demo data", async ({ page }) => {
  await loginAs(page, /Hessa/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hessa");
  await expect(page.getByText("5 claims waiting for your approval")).toBeVisible();
  await expect(page.getByText("Dining out is over budget")).toBeVisible();
  await expect(page.getByText(/Jumada I 1448 AH/)).toBeVisible();
});

test("switching to Arabic flips the layout to right-to-left", async ({ page }) => {
  await loginAs(page, /Hessa/);
  await page.getByRole("button", { name: "Language" }).first().click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByText("موجزك اليوم")).toBeVisible();
  // Preference is saved to the account: a fresh session opens in Arabic.
  await page.context().clearCookies();
  await loginAs(page, /Hessa/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await page.getByRole("button", { name: "اللغة" }).first().click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

test("a family member sees only what belongs to them", async ({ page }) => {
  await loginAs(page, /Maria/);
  const nav = page.locator("aside nav");
  await expect(nav).toContainText("Claims");
  await expect(nav).not.toContainText("Monthly summary");
  await expect(nav).not.toContainText("Members & roles");
  await page.goto("/w/al-mansouri-home/summary");
  await expect(page.getByText("We couldn't find that page")).toBeVisible();
  const other = await page.goto("/w/sadeem");
  expect(other?.status()).toBe(404);
});

test("signup builds a new Home workspace with friendly empty states", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("button", { name: /^Home/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.locator("#orgName").fill("Test Family Home");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.locator("#name").fill("Test Person");
  await page.locator("#email").fill(`test${Date.now()}@example.com`);
  await page.locator("#password").fill("Doha-2026-pearl");
  await page.getByRole("button", { name: /Create workspace/ }).click();
  await page.waitForURL(/\/w\/test-family-home/);
  await expect(page.getByText(/No bills yet/)).toBeVisible();
});

test("too many wrong passwords lock the account for 15 minutes", async ({ page }) => {
  for (let i = 0; i < 6; i++) {
    await page.goto("/login");
    await page.locator("#email").fill("noora@tamam.demo");
    await page.locator("#password").fill(`wrong-${i}`);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator("form [role=alert]")).toBeVisible();
  }
  await expect(page.locator("form [role=alert]")).toContainText("Too many attempts");
});
