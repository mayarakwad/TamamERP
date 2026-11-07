import type { Column, Row } from "../datasets/types";
import { createFormatter, type Formatter } from "../format";
import { createT, type TFunction } from "../i18n";

// Everything an exported file needs, independent of where the rows came from
// (a live dataset or a frozen share-link snapshot).

export interface ExportBrand {
  name: string;
  address: string | null;
  phone?: string | null;
  email?: string | null;
  crNumber?: string | null;
  brandColor: string;
  logoPng: Buffer | null;
  logo: string | null;
}

export interface ExportDoc {
  title: string;
  subtitle?: string;
  columns: Column[];
  rows: Pick<Row, "id" | "cells">[];
  totals: Record<string, number>;
  brand: ExportBrand;
  locale: "en" | "ar";
  dir: "rtl" | "ltr";
  t: TFunction;
  fmt: Formatter;
  generatedAt: Date;
  generatedBy: string;
  appName: string;
  timeZone: string;
}

export function makeDoc(input: {
  title: string;
  subtitle?: string;
  columns: Column[];
  rows: Pick<Row, "id" | "cells">[];
  brand: ExportBrand;
  locale: "en" | "ar";
  digits: "latn" | "arab";
  currency: string;
  timeZone: string;
  generatedBy: string;
  appName: string;
  generatedAt?: Date;
}): ExportDoc {
  const totals: Record<string, number> = {};
  for (const c of input.columns) {
    if (c.total) totals[c.key] = input.rows.reduce((s, r) => s + (typeof r.cells[c.key] === "number" ? (r.cells[c.key] as number) : 0), 0);
  }
  return {
    ...input,
    totals,
    dir: input.locale === "ar" ? "rtl" : "ltr",
    t: createT(input.locale),
    fmt: createFormatter({ locale: input.locale, digits: input.digits, currency: input.currency, timeZone: input.timeZone }),
    generatedAt: input.generatedAt ?? new Date(),
  };
}

/** "Generated 7 Nov 2026, 12:30 · 27 Jumada I 1448 AH · by Hessa" */
export function generatedLine(doc: ExportDoc): string {
  return `${doc.t("toolbar.generated", { date: doc.fmt.dateTime(doc.generatedAt) })} · ${doc.fmt.hijri(doc.generatedAt)} · ${doc.generatedBy}`;
}

/** "QAR" in English, "ر.ق" in Arabic (other currencies keep their code). */
export function currencyLabel(doc: Pick<ExportDoc, "locale" | "fmt">) {
  const code = doc.fmt.config.currency ?? "QAR";
  return doc.locale === "ar" && code === "QAR" ? "ر.ق" : code;
}

export function isNumeric(c: Column) {
  return c.type === "money" || c.type === "number" || c.type === "percent";
}

/** Safe, readable file name: "Claims - November 2026 - 2026-11-07.xlsx" */
export function fileName(doc: ExportDoc, ext: string) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: doc.timeZone }).format(doc.generatedAt);
  const base = [doc.title, doc.subtitle, day].filter(Boolean).join(" - ").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  // Plain-ASCII fallback for old clients; modern browsers use the UTF-8 name.
  const ascii = /^[\x20-\x7e]*$/.test(base) ? base : `export ${day}`;
  return { utf8: `${base}.${ext}`, ascii: `${ascii}.${ext}` };
}

export function contentDisposition(doc: ExportDoc, ext: string, inline = false) {
  const n = fileName(doc, ext);
  return `${inline ? "inline" : "attachment"}; filename="${n.ascii.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(n.utf8)}`;
}
