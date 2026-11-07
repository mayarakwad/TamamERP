import { expect, test, type Page } from "@playwright/test";

const W = "/w/al-mansouri-home";

async function loginAs(page: Page, who: RegExp) {
  await page.goto("/login");
  await page.getByRole("button", { name: who }).click();
  await page.waitForURL(/\/w\//);
}

test.describe.configure({ mode: "serial" });

test("a family member submits a claim with a receipt and the owner approves it", async ({ browser }) => {
  const maria = await (await browser.newContext()).newPage();
  await loginAs(maria, /Maria/);
  await maria.goto(`${W}/claims`);
  await maria.getByRole("button", { name: "New claim" }).click();
  await maria.locator("input[type=file][multiple]").setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") });
  await maria.locator("#c-amount").fill("64.25");
  await maria.locator("#c-merchant").fill("Al Meera Al Waab");
  await maria.getByRole("button", { name: /Groceries/ }).click();
  await maria.getByRole("button", { name: "Submit claim" }).click();
  await maria.waitForURL(/\/claims\/\w+$/);
  await expect(maria.getByText("Waiting").first()).toBeVisible();
  const url = maria.url();

  const hessa = await (await browser.newContext()).newPage();
  await loginAs(hessa, /Hessa/);
  await hessa.goto(url);
  await hessa.getByRole("button", { name: "Approve" }).click();
  await expect(hessa.getByText(/Approved by Hessa/)).toBeVisible();
});

test("tables export to Excel, Word, PDF and CSV", async ({ page }) => {
  await loginAs(page, /Hessa/);
  const base = `/api${W}/export/claims?month=2026-11`;
  const xlsx = await page.request.get(`${base}&format=xlsx`);
  expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK");
  const docx = await page.request.get(`${base}&format=docx`);
  expect((await docx.body()).subarray(0, 2).toString()).toBe("PK");
  const csv = await page.request.get(`${base}&format=csv`);
  expect([...(await csv.body()).subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const pdf = await page.request.get(`${base}&format=pdf`);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  const print = await page.request.get(`${base}&format=print`);
  expect(await print.text()).toContain("window.print()");
});

test("a share link shows a frozen, view-only copy to anyone with the link", async ({ page, browser }) => {
  await loginAs(page, /Hessa/);
  await page.goto(`${W}/bills`);
  await page.getByRole("button", { name: "Share link" }).click();
  await page.getByRole("button", { name: "Create link" }).click();
  const url = await page.locator("input[readonly]").inputValue();
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(url);
  await expect(anon.getByText("View-only copy")).toBeVisible();
  await expect(anon.getByText("Electricity & water")).toBeVisible();
});

test("paying a bill schedules the next one", async ({ page }) => {
  await loginAs(page, /Hessa/);
  await page.goto(`${W}/bills`);
  await page.getByRole("button", { name: "Mark paid" }).first().click();
  await page.getByRole("button", { name: "Mark paid" }).last().click();
  await expect(page.getByText(/paid\. Next due/)).toBeVisible();
});

test("an invitation link brings a new person into the workspace", async ({ page, browser }) => {
  await loginAs(page, /Hessa/);
  await page.goto(`${W}/settings/members`);
  await page.getByRole("button", { name: "Invite people" }).click();
  await page.locator("#inv-email").fill(`guest${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Create invitation" }).click();
  const link = await page.locator("input[readonly]").inputValue();
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(link);
  await guest.locator("#i-name").fill("Guest Person");
  await guest.locator("#i-password").fill("Doha-2026-pearl");
  await guest.getByRole("button", { name: /Join/ }).click();
  await guest.waitForURL(new RegExp(`${W}$`));
});

test("a password-protected backup restores as a new workspace", async ({ page }) => {
  await loginAs(page, /Hessa/);
  const backup = await page.request.post(`/api${W}/backup`, { multipart: { password: "pearl-diver", includeFiles: "true" } });
  const buffer = await backup.body();
  expect(buffer.subarray(0, 2).toString()).toBe("PK");
  const wrong = await page.request.post(`/api${W}/restore`, { multipart: { file: { name: "b.tamam", mimeType: "application/octet-stream", buffer }, password: "nope", mode: "new" } });
  expect(wrong.status()).toBe(400);
  const ok = await page.request.post(`/api${W}/restore`, { multipart: { file: { name: "b.tamam", mimeType: "application/octet-stream", buffer }, password: "pearl-diver", mode: "new" } });
  const json = await ok.json();
  await page.goto(`/w/${json.slug}/claims`);
  await expect(page.locator("tbody tr").first()).toBeVisible();
});

test("search finds records in Arabic and English, within each person's access", async ({ page, browser }) => {
  await loginAs(page, /Hessa/);
  const ar = await page.request.get(`/api${W}/search?q=${encodeURIComponent("بقاله")}`).then((r) => r.json());
  expect(ar.hits.length).toBeGreaterThan(0);
  const maria = await (await browser.newContext()).newPage();
  await loginAs(maria, /Maria/);
  const r = await maria.request.get(`/api${W}/search?q=virgin`).then((x) => x.json());
  expect(r.hits.every((h: { type: string }) => h.type !== "claim")).toBe(true);
});
