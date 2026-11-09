import { expect, test, type Page } from "@playwright/test";

// The workspace setup guide: a new workspace opens it once, steps tick off
// from real data, and the dashboard shows how far along it is.

async function signUp(page: Page, type: "Business" | "School" | "Home", org: string) {
  await page.goto("/signup");
  await page.getByRole("button", { name: new RegExp(`^${type}`) }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.locator("#orgName").fill(org);
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.locator("#name").fill("Guide Tester");
  await page.locator("#email").fill(`guide${Date.now()}@example.com`);
  await page.locator("#password").fill("Doha-2026-pearl");
  await page.getByRole("button", { name: /Create workspace/ }).click();
  await page.waitForURL(/\/welcome$/, { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
}

test("a new business is guided through its setup and keeps its place", async ({ page }) => {
  await signUp(page, "Business", "Guide Trading");
  await expect(page.getByRole("heading", { name: "Set up Guide Trading" })).toBeVisible();
  await expect(page.getByText("0 of 7 done")).toBeVisible();

  await page.fill("#ob-name-ar", "دليل للتجارة");
  await page.fill("#ob-cr", "998877");
  await page.getByRole("button", { name: "Save and continue" }).click();

  await expect(page.getByRole("heading", { name: "Branches and warehouses" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Add a branch" }).click();
  await page.getByPlaceholder("Name", { exact: true }).fill("Industrial Area");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Industrial Area")).toBeVisible();
  await page.getByRole("button", { name: "Looks right" }).click();

  await expect(page.getByRole("heading", { name: "Invoices and bank details" })).toBeVisible({ timeout: 20_000 });
  await page.fill("#ob-iban", "QA00 NOT AN IBAN");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("This IBAN doesn't look right")).toBeVisible();
  await page.fill("#ob-bank", "QNB");
  await page.fill("#ob-iban", "QA58DOHB00001234567890ABCDEFG");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "Products and customers" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("3 of 7 done")).toBeVisible();

  // Later: the dashboard keeps the place.
  await page.getByRole("link", { name: "I'll finish later" }).click();
  await expect(page.getByText("Finish setting up Guide Trading")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("3 of 7 steps done")).toBeVisible();

  // Coming back to a step shows what was saved.
  await page.goto("/w/guide-trading/welcome?step=branches");
  await expect(page.getByText("Industrial Area")).toBeVisible();
  await page.goto("/w/guide-trading/welcome?step=invoicing");
  await expect(page.locator("#ob-iban")).toHaveValue(/QA58 DOHB/);
});

test("a new home sets its budgets and adds a bill from a preset", async ({ page }) => {
  await signUp(page, "Home", "Guide Family");
  await page.getByRole("button", { name: /Monthly budgets/ }).click();
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "Recurring bills" })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Add" }).first().click();
  await expect(page.getByText("Added").first()).toBeVisible();
  await expect(page.getByText("Bills: 1")).toBeVisible();
  await page.goto("/w/guide-family/bills");
  await expect(page.getByText("Kahramaa (electricity and water)").first()).toBeVisible();
});

test("a school sees its own steps and can open online applications", async ({ page }) => {
  await signUp(page, "School", "Guide Academy");
  for (const step of ["Campuses", "Fee structure", "Staff and classes", "Online applications"]) await expect(page.getByRole("button", { name: new RegExp(step) })).toBeVisible();
  await page.getByRole("button", { name: /Online applications/ }).click();
  await expect(page.getByText("/apply/guide-academy")).toBeVisible();
  await page.getByRole("button", { name: "Looks right" }).click();
  await expect(page.getByText("1 of 8 done")).toBeVisible();
});

test("the demo workspaces don't open the guide", async ({ page }) => {
  await page.goto("/login");
  await page.fill("#email", "khalid@tamam.demo");
  await page.fill("#password", "demo1234");
  await page.getByRole("button", { name: /^Sign in$/ }).click();
  await page.waitForURL(/\/w\//);
  expect(page.url()).not.toContain("/welcome");
  await expect(page.getByText(/Finish setting up/)).toHaveCount(0);
});
