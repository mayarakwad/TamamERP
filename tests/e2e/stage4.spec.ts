import { expect, test, type Browser, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const W = "/w/al-manara";
const HOME = "/w/al-mansouri-home";

async function signIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "demo1234");
  await page.getByRole("button", { name: /^Sign in$/ }).click();
  await page.waitForURL(/\/w\//);
  return page;
}

async function openFlow(page: Page) {
  // The header button (Ctrl/⌘ J does the same once the page has loaded).
  await expect(async () => {
    await page.locator('button[title^="Ask Flow"]').click();
    await expect(page.locator("[data-flow-panel]")).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30_000 });
}

async function ask(page: Page, text: string) {
  const box = page.locator("[data-flow-panel] textarea");
  await box.fill(text);
  await box.press("Enter");
}

/** Settings → Flow: switch to the scripted test provider. */
async function useTestProvider(page: Page, slug: string) {
  await page.goto(`${slug}/settings/flow`);
  await page.getByRole("button", { name: /Test provider/ }).click();
  await page.getByRole("button", { name: "Test connection" }).locator("xpath=following-sibling::button").click();
  await expect(page.getByText("Saved").first()).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("Flow explains how to turn it on until a key is connected", async ({ browser }) => {
  const owner = await signIn(browser, "fatima@tamam.demo");
  await owner.goto(W);
  await openFlow(owner);
  await expect(owner.getByText("Flow isn't connected yet")).toBeVisible();
  await expect(owner.getByRole("link", { name: "Connect an AI key" })).toBeVisible();
  const teacher = await signIn(browser, "aisha@tamam.demo");
  await teacher.goto(W);
  await openFlow(teacher);
  await expect(teacher.getByText(/Ask an owner or admin to connect one/)).toBeVisible();
});

test("an admin saves a key that never reaches the browser", async ({ browser }) => {
  const page = await signIn(browser, "fatima@tamam.demo");
  await page.goto(`${W}/settings/flow`);
  await page.getByRole("button", { name: "Claude (Anthropic)" }).click();
  await page.fill("#fs-key", "sk-ant-e2e-SECRETVALUE-123456");
  await page.locator("#fs-key").locator("xpath=ancestor::div[contains(@class,'flex gap-2')][1]").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved key sk-ant-…3456")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Saved key sk-ant-…3456")).toBeVisible();
  expect(await page.content()).not.toContain("SECRETVALUE");
  const html = await (await page.request.get(`${W}/settings/flow`)).text();
  expect(html).not.toContain("SECRETVALUE");
  // Switch to the scripted test provider for the rest of the tests (this clears the Claude key).
  await useTestProvider(page, W);
});

test("Flow answers from the school's data and only proposes changes", async ({ browser }) => {
  const page = await signIn(browser, "fatima@tamam.demo");
  await page.goto(W);
  await openFlow(page);
  await ask(page, "Which students missed more than three days in the last two weeks?");
  await expect(page.getByText(/Checked the roll calls · \d+ students/)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-flow-panel] table")).toBeVisible();

  // The answer downloads as Word.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download as Word" }).last().click();
  const file = await (await download).path();
  expect((await readFile(file!)).subarray(0, 2).toString()).toBe("PK");

  // A change is only a proposal until it's confirmed.
  await ask(page, "announce sports day");
  const card = page.locator("[data-flow-panel]").getByText("Announce: Sports day on Thursday");
  await expect(card).toBeVisible({ timeout: 20_000 });
  await page.goto(`${W}/announcements`);
  await expect(page.getByText("Sports day is on Thursday")).toHaveCount(0);
  await openFlow(page);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/Announcement published to \d+ people/).first()).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(page.getByText("Sports day is on Thursday").first()).toBeVisible();
});

test("a parent's Flow only sees their own children", async ({ browser }) => {
  const page = await signIn(browser, "hessa@tamam.demo");
  await page.goto(W);
  await openFlow(page);
  await ask(page, "find Ward");
  await expect(page.getByText("Searched for “Ward” · 0 found")).toBeVisible({ timeout: 20_000 });
  await ask(page, "Which students missed more than zero days in the last four weeks?");
  await expect(page.getByText(/Checked the roll calls · [0-2] students/)).toBeVisible({ timeout: 20_000 });
});

test("Flow fills in the form that's open", async ({ browser }) => {
  const page = await signIn(browser, "hessa@tamam.demo");
  await useTestProvider(page, HOME);
  await page.goto(`${HOME}/claims`);
  await page.getByRole("button", { name: /New claim/ }).first().click();
  await expect(page.locator("#c-amount")).toBeVisible();
  await page.getByRole("button", { name: "Ask Flow to help with this form" }).click();
  await ask(page, "fill 85 at Lulu Hypermarket");
  await page.getByRole("button", { name: "Fill in" }).click();
  await expect(page.locator("#c-amount")).toHaveValue("85");
  await expect(page.locator("#c-merchant")).toHaveValue("Lulu Hypermarket");
});

test("usage is tracked and the monthly limit pauses Flow", async ({ browser }) => {
  const page = await signIn(browser, "fatima@tamam.demo");
  await page.goto(`${W}/settings/flow`);
  await expect(page.getByRole("cell", { name: "Dr. Fatima Al-Sulaiti" })).toBeVisible();
  await page.getByLabel("No limit").uncheck();
  await page.fill("#fs-limit", "0");
  await page.locator("#fs-limit").locator("xpath=ancestor::div[contains(@class,'flex gap-2')][1]").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved").first()).toBeVisible();
  await page.goto(W);
  await openFlow(page);
  await ask(page, "What needs my attention today?");
  await expect(page.getByText(/reached this month's spending limit/)).toBeVisible({ timeout: 15_000 });
  await page.goto(`${W}/settings/flow`);
  await page.getByLabel("No limit").check();
  await page.locator("#fs-limit").locator("xpath=ancestor::div[contains(@class,'flex gap-2')][1]").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved").first()).toBeVisible();
});
