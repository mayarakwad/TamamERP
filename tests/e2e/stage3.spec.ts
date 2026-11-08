import { expect, test, type Browser, type Page } from "@playwright/test";

const W = "/w/al-manara";

async function signIn(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", "demo1234");
  await page.getByRole("button", { name: /^Sign in$/ }).click();
  await page.waitForURL(/\/w\//);
  return page;
}

test.describe.configure({ mode: "serial" });

test("a class teacher takes the roll for 5-B", async ({ browser }) => {
  const page = await signIn(browser, "aisha@tamam.demo");
  await page.goto(W);
  await page.getByRole("link", { name: "Take the roll" }).first().click();
  await page.waitForURL(/attendance\?section=/);
  // Tap the first child once: absent.
  const first = page.locator("button[aria-label$=': Present']").first();
  const name = ((await first.getAttribute("aria-label")) ?? "").split(":")[0];
  await first.click();
  await expect(page.getByRole("button", { name: `${name}: Absent` })).toBeVisible();
  await page.getByRole("button", { name: "Save roll" }).click();
  await expect(page.getByText(/Roll saved · 1 absent/).first()).toBeVisible({ timeout: 15_000 });
  await page.goto(W);
  await expect(page.getByText(/Roll taken · 1 absent/).first()).toBeVisible();
});

test("the science teacher enters mid-term marks by typing and pasting", async ({ browser }) => {
  const page = await signIn(browser, "aisha@tamam.demo");
  await page.goto(W);
  await page.getByRole("link", { name: /Mid-term exam/ }).first().click();
  await page.waitForURL(/gradebook/);
  await expect(page.getByRole("heading", { name: /Science · 5-B/ })).toBeVisible();
  const cells = page.locator('input[aria-label$="· Mid-term exam"]');
  await cells.first().fill("44");
  await cells.first().press("Enter");
  // Paste a column for the next three students, the way it comes out of Excel.
  await cells.nth(1).focus();
  await page.evaluate(() => {
    const el = document.activeElement as HTMLInputElement;
    const data = new DataTransfer();
    data.setData("text/plain", "38\r\n41.5\r\na\r\n");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(page.getByText("Pasted 3 marks")).toBeVisible();
  await expect(page.getByText("Saved").first()).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(cells.first()).toHaveValue("44");
  await expect(cells.nth(2)).toHaveValue("41.5");
  await expect(cells.nth(3)).toHaveValue("a");
});

test("a family applies online and the office enrols the child", async ({ browser }) => {
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/apply/al-manara`, { waitUntil: "networkidle" });
  await visitor.selectOption("#pa-grade", { label: "Grade 2" });
  await visitor.fill("#pa-childName", "Zain Test Applicant");
  await visitor.fill("#pa-dob", "2019-03-14");
  await visitor.fill("#pa-guardianName", "Rana Applicant");
  await visitor.fill("#pa-guardianPhone", "+974 5000 1234");
  await visitor.fill("#pa-guardianEmail", "rana.applicant@example.com");
  await visitor.getByRole("checkbox").check();
  await visitor.getByRole("button", { name: "Send application" }).click();
  await expect(visitor.getByText(/Your reference is APP-\d{4}-\d{5}/)).toBeVisible({ timeout: 15_000 });

  const office = await signIn(browser, "fatima@tamam.demo");
  await office.goto(`${W}/admissions`);
  await office.getByText("Zain Test Applicant").first().click();
  await office.getByRole("button", { name: "Make an offer" }).click();
  await expect(office.getByText("Moved to Offered").first()).toBeVisible({ timeout: 15_000 });
  await office.getByRole("button", { name: "Enrol" }).first().click();
  await office.getByRole("dialog").getByRole("button", { name: "Enrol" }).click();
  await expect(office.getByText("Zain Test Applicant is enrolled").first()).toBeVisible({ timeout: 15_000 });
});

test("finance records a family's overdue fees and the invoice is paid", async ({ browser }) => {
  const page = await signIn(browser, "rami@tamam.demo");
  await page.goto(`${W}/fees`);
  await page.getByRole("button", { name: "Record payment" }).nth(1).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Open invoices")).toBeVisible();
  await expect(sheet.locator("#fp-amount")).not.toHaveValue("");
  await sheet.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText(/fees are paid in full|Payment RCV-/).first()).toBeVisible({ timeout: 15_000 });
});

test("parents see their children, fees and a printable bilingual report card", async ({ browser }) => {
  const page = await signIn(browser, "hessa@tamam.demo");
  await page.goto(`${W}/children`);
  await expect(page.getByRole("tab", { name: /Ahmed/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Mariam/ })).toBeVisible();
  const href = await page.locator('a[href*="/export/report-card?id="]').first().getAttribute("href");
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain("Report card");
  expect(html).toContain("الشهادة الدراسية");
  // Parents can't reach staff pages or other children.
  await page.goto(`${W}/students`);
  await expect(page.getByText("We couldn't find that page").first()).toBeVisible();
});

test("a principal tied to one campus only sees that campus", async ({ browser }) => {
  const owner = await signIn(browser, "fatima@tamam.demo");
  const all = (await (await owner.request.get(`/api${W}/export/students?format=csv`)).text()).trim().split("\n");
  const lusail = all.filter((line) => line.includes("Lusail campus")).length;
  const sarah = await signIn(browser, "sarah@tamam.demo");
  const mine = (await (await sarah.request.get(`/api${W}/export/students?format=csv`)).text()).trim().split("\n");
  expect(lusail).toBeGreaterThan(50);
  expect(mine.length - 1).toBe(lusail);
  // Ahmed is at Al Waab, so Sarah can't open his record.
  await sarah.goto(`${W}/students?q=Ahmed Khalid`);
  await expect(sarah.getByText("Ahmed Khalid Al-Mansouri")).toHaveCount(0);
});

test("timetables refuse to put a teacher in two rooms at once", async ({ browser }) => {
  const page = await signIn(browser, "fatima@tamam.demo");
  await page.goto(`${W}/classes`);
  await page.getByRole("link", { name: /5-A/ }).first().click();
  await page.waitForURL(/classes\/c/);
  // Specialists teach several classes, so somewhere in the week a subject can't move into a period.
  const cells = page.getByRole("button", { name: / P\d+: / });
  let found = false;
  for (let i = 0; i < 12 && !found; i++) {
    await cells.nth(i * 3).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    found = (await dialog.locator("button[disabled]").filter({ hasText: /is teaching/ }).count()) > 0;
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
  expect(found).toBe(true);
});

test("a school backup restores with students, marks and balanced books", async ({ browser }) => {
  const page = await signIn(browser, "fatima@tamam.demo");
  const backup = await page.request.post(`/api${W}/backup`, { multipart: { password: "", includeFiles: "false" } });
  const buffer = await backup.body();
  const res = await page.request.post(`/api${W}/restore`, { multipart: { file: { name: "al-manara.tamam", mimeType: "application/octet-stream", buffer }, mode: "new" }, timeout: 120_000 });
  const { slug } = await res.json();
  const csv = await (await page.request.get(`/api/w/${slug}/export/students?format=csv`)).text();
  const original = await (await page.request.get(`/api${W}/export/students?format=csv`)).text();
  expect(csv.split("\n").length).toBe(original.split("\n").length);
  await page.goto(`/w/${slug}/reports/tb`);
  const text = (await page.locator("tfoot").textContent()) ?? "";
  const [dr, cr] = text.match(/QAR[\s ][\d,.]+/g) ?? [];
  expect(dr).toBeTruthy();
  expect(dr).toBe(cr);
});
