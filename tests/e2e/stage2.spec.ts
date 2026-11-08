import { expect, test, type Browser, type Page } from "@playwright/test";

const W = "/w/sadeem";

async function signIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "demo1234");
  await page.getByRole("button", { name: /^Sign in$/ }).click();
  await page.waitForURL(/\/w\//);
  return page;
}

/** Sum of the two money cells in a table footer (debit and credit columns). */
async function footerAmounts(page: Page) {
  const text = (await page.locator("tfoot").textContent()) ?? "";
  return text.match(/QAR[\s ][\d,.]+/g) ?? [];
}

test.describe.configure({ mode: "serial" });

test("an invoice is written, issued, part-paid and printed, and the books follow", async ({ browser }) => {
  const page = await signIn(browser, "priya@tamam.demo");
  await page.goto(`${W}/sales/invoices/new`);
  await page.getByRole("combobox").first().click();
  await page.keyboard.type("Sealine");
  await page.keyboard.press("Enter");
  await page.getByRole("combobox").filter({ hasText: "Item (optional)" }).first().click();
  await page.keyboard.type("A4 copy paper 80");
  await page.keyboard.press("Enter");
  await page.getByLabel("Qty").first().fill("10");
  await page.getByRole("button", { name: "Save and issue" }).click();
  await page.waitForURL(/invoices\/c\w+$/, { timeout: 30_000 });
  await expect(page.getByText("Open").first()).toBeVisible();
  // 10 reams at QAR 21.00 (the 8% list price of 19.50, rounded to quarters)
  await expect(page.getByText("Qatari Riyals Two Hundred Ten Only").first()).toBeVisible();

  await page.getByRole("button", { name: "Ledger entries" }).click();
  await expect(page.getByText("Accounts receivable").first()).toBeVisible();
  await expect(page.getByText("Cost of goods sold").first()).toBeVisible();

  await page.getByRole("button", { name: "Record payment received" }).click();
  await expect(page.locator("#pay-amount")).toHaveValue("210.00");
  await page.locator("#pay-amount").fill("100");
  await page.getByRole("button", { name: "Save payment" }).click();
  await expect(page.getByText("Part paid").first()).toBeVisible({ timeout: 15_000 });

  const id = page.url().split("/").pop();
  const print = await page.request.get(`/api${W}/export/document?id=${id}&format=print`);
  const html = await print.text();
  expect(html).toContain("Balance due");
  expect(html).toContain("110.00");
});

test("a quotation converts into an invoice", async ({ browser }) => {
  const page = await signIn(browser, "khalid@tamam.demo");
  await page.goto(`${W}/sales/quotations?status=sent`);
  await page.locator("tbody tr").first().click();
  await page.waitForURL(/quotations\/c/);
  await page.getByRole("button", { name: "Convert to invoice" }).click();
  await page.waitForURL(/invoices\/c/, { timeout: 30_000 });
  await expect(page.getByText("Created from").first()).toBeVisible();
  await expect(page.getByText("Draft").first()).toBeVisible();
});

test("the storekeeper sees stock and purchase orders but no sales", async ({ browser }) => {
  const page = await signIn(browser, "joseph@tamam.demo");
  await page.goto(W);
  const nav = page.locator("nav").first();
  await expect(nav.getByText("Stock").first()).toBeVisible();
  await expect(nav.getByText("Purchase orders").first()).toBeVisible();
  await expect(nav.getByText("Invoices")).toHaveCount(0);
  await page.goto(`${W}/sales/invoices`);
  await expect(page.getByText("We couldn't find that page").first()).toBeVisible();
  await page.goto(`${W}/inventory/items`);
  await expect(page.locator("thead")).not.toContainText("Avg. cost");
});

test("a delivery is received and billed, and stock goes up", async ({ browser }) => {
  const page = await signIn(browser, "omar@tamam.demo");
  await page.goto(`${W}/purchases/orders?status=sent`);
  await page.locator("tbody tr").first().click();
  await page.waitForURL(/orders\/c/);
  await page.getByRole("button", { name: "Receive goods" }).click();
  await page.getByRole("button", { name: "Add to stock" }).click();
  await expect(page.getByText("Received").first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Create bill" }).first().click();
  await page.locator("#bill-ref").fill("TT-90311");
  await page.getByRole("dialog").getByRole("button", { name: "Create bill" }).click();
  await page.waitForURL(/bills\/c/, { timeout: 30_000 });
  await page.getByRole("button", { name: "Post bill" }).click();
  await expect(page.getByText("TT-90311").first()).toBeVisible();
  await expect(page.getByText("Open").first()).toBeVisible({ timeout: 15_000 });
});

test("payroll is prepared, approved and produces a valid WPS file", async ({ browser }) => {
  const priya = await signIn(browser, "priya@tamam.demo");
  await priya.goto(`${W}/hr/payroll`);
  await priya.getByRole("button", { name: /Prepare/ }).click();
  await priya.waitForURL(/payroll\/c/, { timeout: 60_000 });
  await expect(priya.getByText("All 14 bank-paid records pass the WPS checks.").first()).toBeVisible();
  // The accountant prepares; an admin approves.
  await expect(priya.getByRole("button", { name: "Approve" })).toHaveCount(0);
  const runUrl = priya.url();

  const omar = await signIn(browser, "omar@tamam.demo");
  await omar.goto(runUrl);
  await omar.getByRole("button", { name: "Approve" }).click();
  await omar.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(omar.getByText(/Approved by/).first()).toBeVisible({ timeout: 15_000 });

  const runId = runUrl.split("/").pop();
  const res = await priya.request.get(`/api${W}/payroll/${runId}/wps`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toMatch(/SIF_10448392_QNB_\d{8}_\d{4}\.csv/);
  const rows = (await res.text()).trimEnd().split("\r\n");
  expect(rows[0].startsWith("Employer EID,File Creation Date,File Creation Time")).toBe(true);
  expect(rows[2].split(",")).toHaveLength(22);
  expect(rows).toHaveLength(3 + 14);
  const header = rows[1].split(",");
  const total = rows.slice(3).reduce((s, r) => s + Number(r.split(",")[8]), 0);
  expect(Number(header[8])).toBeCloseTo(total, 2);
  expect(rows.some((r) => r.includes("Rahim"))).toBe(false);
});

test("an employee checks in and asks for leave; the manager approves", async ({ browser }) => {
  const joseph = await signIn(browser, "joseph@tamam.demo");
  await joseph.goto(`${W}/hr/attendance`);
  await joseph.getByRole("button", { name: "Check in" }).click();
  await expect(joseph.getByText(/At work since/).first()).toBeVisible({ timeout: 15_000 });

  const omar = await signIn(browser, "omar@tamam.demo");
  await omar.goto(`${W}/hr/leave?status=submitted`);
  await omar.locator("tbody tr").filter({ hasText: "Lina" }).locator("button").first().click();
  await omar.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await expect(omar.getByText("Leave approved").first()).toBeVisible();
});

test("the statements balance", async ({ browser }) => {
  const page = await signIn(browser, "khalid@tamam.demo");
  await page.goto(`${W}/reports/tb`);
  const [dr, cr] = await footerAmounts(page);
  expect(dr).toBeTruthy();
  expect(dr).toBe(cr);
  await page.goto(`${W}/reports/bs`);
  const rows = await page.locator("tbody tr").allTextContents();
  const assets = rows.find((r) => r.startsWith("Total assets"))!.replace("Total assets", "");
  const le = rows.find((r) => r.startsWith("Total liabilities and equity"))!.replace("Total liabilities and equity", "");
  expect(assets).toBe(le);
});

test("a business backup restores with its books intact", async ({ browser }) => {
  const page = await signIn(browser, "khalid@tamam.demo");
  const backup = await page.request.post(`/api${W}/backup`, { multipart: { password: "", includeFiles: "true" } });
  const buffer = await backup.body();
  const res = await page.request.post(`/api${W}/restore`, { multipart: { file: { name: "sadeem.tamam", mimeType: "application/octet-stream", buffer }, mode: "new" } });
  const { slug } = await res.json();
  await page.goto(`/w/${slug}/reports/tb`);
  const [dr, cr] = await footerAmounts(page);
  await page.goto(`${W}/reports/tb`);
  const [dr0] = await footerAmounts(page);
  expect(dr).toBe(cr);
  expect(dr).toBe(dr0);
  await page.goto(`/w/${slug}/hr/employees`);
  await expect(page.locator("tbody tr")).toHaveCount(15);
});

test("search finds customers and invoices for finance, not for the storekeeper", async ({ browser }) => {
  const khalid = await signIn(browser, "khalid@tamam.demo");
  const { hits } = await (await khalid.request.get(`/api${W}/search?q=bidda`)).json();
  expect(hits.some((h: { type: string; title: string }) => h.type === "party")).toBe(true);
  expect(hits.some((h: { type: string; title: string }) => h.type === "document")).toBe(true);
  const joseph = await signIn(browser, "joseph@tamam.demo");
  const { hits: none } = await (await joseph.request.get(`/api${W}/search?q=bidda`)).json();
  expect(none.some((h: { type: string; title: string }) => h.type === "party" || (h.type === "document" && !h.title.startsWith("PO-")))).toBe(false);
});
