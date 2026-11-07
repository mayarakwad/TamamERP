import "server-only";
import type { Browser } from "playwright-core";
import { esc } from "./html";

// PDFs are printed by headless Chromium: the only engine that shapes Arabic
// correctly and supports right-to-left tables. One browser is kept warm and
// shared between requests.

const g = globalThis as unknown as { tamamBrowser?: Promise<Browser> };

async function browser(): Promise<Browser> {
  if (!g.tamamBrowser) {
    g.tamamBrowser = (async () => {
      const { chromium } = await import("playwright-core");
      const b = await chromium.launch({
        executablePath: process.env.CHROMIUM_PATH || undefined,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none"],
      });
      b.on("disconnected", () => (g.tamamBrowser = undefined));
      return b;
    })().catch((e) => {
      g.tamamBrowser = undefined;
      throw e;
    });
  }
  return g.tamamBrowser;
}

export class PdfUnavailable extends Error {}

export async function htmlToPdf(html: string, opts: { landscape: boolean; footerLeft: string; dir: "rtl" | "ltr"; locale: "en" | "ar" }): Promise<Buffer> {
  let b: Browser;
  try {
    b = await browser();
  } catch (e) {
    throw new PdfUnavailable(e instanceof Error ? e.message : "Chromium not available");
  }
  const page = await b.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const pageWord = opts.locale === "ar" ? "صفحة" : "Page";
    const of = opts.locale === "ar" ? "من" : "of";
    return await page.pdf({
      format: "A4",
      landscape: opts.landscape,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `<div dir="${opts.dir}" style="width:100%;font-size:7.5px;color:#888;padding:0 12mm;display:flex;justify-content:space-between;font-family:Arial,sans-serif"><span>${esc(opts.footerLeft)}</span><span>${pageWord} <span class="pageNumber"></span> ${of} <span class="totalPages"></span></span></div>`,
      margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" },
    });
  } finally {
    await page.close().catch(() => {});
  }
}
