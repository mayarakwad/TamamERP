import { describe, expect, it } from "vitest";
import { normalizeSearch, searchTerms } from "@/lib/text";
import { formatCell, rawCell } from "@/lib/datasets/format-cell";
import { createFormatter } from "@/lib/format";
import { createT } from "@/lib/i18n";
import { renderCsv } from "@/lib/export/csv";
import { makeDoc } from "@/lib/export/doc";
import type { Column } from "@/lib/datasets/types";

describe("Arabic-aware search normalization", () => {
  it("folds alef forms, ta marbuta, alef maqsura and diacritics", () => {
    expect(normalizeSearch("أحمد")).toBe(normalizeSearch("احمد"));
    expect(normalizeSearch("إبراهيم")).toBe("ابراهيم");
    expect(normalizeSearch("البقالة")).toBe("البقاله");
    expect(normalizeSearch("مستشفى")).toBe("مستشفي");
    expect(normalizeSearch("مُحَمَّد")).toBe("محمد");
    expect(normalizeSearch("ســلام")).toBe("سلام"); // tatweel
  });
  it("folds Arabic-Indic digits, case and accents", () => {
    expect(normalizeSearch("CLM-٢٠٢٦")).toBe("clm-2026");
    expect(normalizeSearch("Café")).toBe("cafe");
    expect(searchTerms("  Carrefour   City ")).toEqual(["carrefour", "city"]);
  });
});

const money: Column = { key: "amount", label: "claims.colAmount", type: "money", total: true };
const status: Column = { key: "status", label: "claims.colStatus", type: "enum", options: { submitted: "status.submitted" } };
const merchant: Column = { key: "merchant", label: "claims.colMerchant", type: "text" };

describe("cell formatting", () => {
  const en = createFormatter({ locale: "en", digits: "latn" });
  const t = createT("en");
  it("formats on screen and keeps raw values for spreadsheets", () => {
    expect(formatCell(money, 94900, en, t).replace(/ /g, " ")).toBe("QAR 949.00");
    expect(rawCell(money, 94900, t)).toBe(949);
    expect(formatCell(status, "submitted", en, t)).toBe("Waiting");
    expect(rawCell({ key: "d", label: "claims.colDate", type: "date" }, "2026-11-07T09:00:00.000Z", t)).toBe("2026-11-07");
  });
});

describe("CSV export", () => {
  const doc = makeDoc({
    title: "Claims",
    columns: [merchant, money, status],
    rows: [
      { id: "1", cells: { merchant: 'Ali "Baba", Doha', amount: 12550, status: "submitted" } },
      { id: "2", cells: { merchant: "=HYPERLINK(\"http://evil\")", amount: 100, status: "submitted" } },
      { id: "3", cells: { merchant: "البقالة", amount: 5000, status: "submitted" } },
    ],
    brand: { name: "Test", address: null, brandColor: "#8A1538", logo: null, logoPng: null },
    locale: "en",
    digits: "latn",
    currency: "QAR",
    timeZone: "Asia/Qatar",
    generatedBy: "Test",
    appName: "Tamam",
  });
  const buf = renderCsv(doc);
  const csv = buf.toString("utf8");
  it("starts with a UTF-8 BOM so Excel reads Arabic", () => {
    expect([...buf.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(csv).toContain("البقالة");
  });
  it("quotes commas and quotes, uses CRLF, and keeps amounts numeric", () => {
    expect(csv).toContain('"Ali ""Baba"", Doha",125.5,Waiting\r\n');
    expect(csv.split("\r\n")[0]).toBe("﻿Merchant,Amount (QAR),Status");
  });
  it("neutralises formula injection", () => {
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });
  it("totals money columns", () => {
    expect(doc.totals.amount).toBe(17650);
  });
});
