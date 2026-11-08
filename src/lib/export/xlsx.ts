import ExcelJS from "exceljs";
import { rawCell } from "../datasets/format-cell";
import { columnLabel } from "../datasets/types";
import { currencyLabel, generatedLine, isNumeric, type ExportDoc } from "./doc";

// Real spreadsheets: numbers stay numbers (with currency formats), dates are
// real dates, a SUM formula totals money columns, the header row is frozen and
// filterable, and Arabic workbooks open right-to-left.

const FONT = "Arial";

function toExcelDate(iso: string, timeZone: string): Date {
  // Excel dates have no time zone: use the calendar day in the workspace's zone.
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso)).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function colLetter(n: number) {
  let s = "";
  for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export async function renderXlsx(doc: ExportDoc): Promise<Buffer> {
  const rtl = doc.dir === "rtl";
  const currency = doc.fmt.config.currency ?? "QAR";
  const moneyFmt = rtl ? `#,##0.00 [$${currency === "QAR" ? "ر.ق." : currency}]` : `[$${currency}] #,##0.00`;
  const cols = doc.columns;
  const brandArgb = "FF" + doc.brand.brandColor.replace("#", "").toUpperCase();
  const tintArgb = "FFF3EFEC";

  const wb = new ExcelJS.Workbook();
  wb.creator = doc.appName;
  wb.lastModifiedBy = doc.generatedBy;
  wb.created = doc.generatedAt;
  wb.modified = doc.generatedAt;
  wb.title = doc.title;
  wb.company = doc.brand.name;

  const sheetName = doc.title.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Sheet1";
  const headerRowNo = doc.subtitle ? 6 : 5;
  const ws = wb.addWorksheet(sheetName, {
    views: [{ rightToLeft: rtl, state: "frozen", ySplit: headerRowNo, showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: cols.length > 6 ? "landscape" : "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: `${headerRowNo}:${headerRowNo}`,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.7, header: 0.3, footer: 0.3 },
    },
    headerFooter: { oddFooter: `&L${doc.brand.name.replace(/&/g, "&&")}&C&P / &N&R${doc.appName}` },
  });

  ws.columns = cols.map((c) => ({ key: c.key, width: Math.max(10, c.width ?? 16) }));
  const lastCol = colLetter(cols.length - 1);
  const align = (c: (typeof cols)[number]): Partial<ExcelJS.Alignment> => ({
    vertical: "middle",
    horizontal: isNumeric(c) ? "right" : rtl ? "right" : "left",
    readingOrder: rtl ? "rtl" : "ltr",
    wrapText: c.type === "text" && (c.width ?? 16) >= 25,
  });

  // Title block (with the logo when there is one).
  const indent = doc.brand.logoPng ? 1 : 0;
  const titleCell = (row: number, text: string, font: Partial<ExcelJS.Font>) => {
    const from = colLetter(Math.min(indent, cols.length - 1));
    ws.mergeCells(`${from}${row}:${lastCol}${row}`);
    const c = ws.getCell(`${from}${row}`);
    c.value = text;
    c.font = { name: FONT, ...font };
    c.alignment = { vertical: "middle", horizontal: rtl ? "right" : "left", readingOrder: rtl ? "rtl" : "ltr" };
  };
  ws.getRow(1).height = 26;
  titleCell(1, doc.title, { size: 16, bold: true, color: { argb: brandArgb } });
  titleCell(2, [doc.brand.name, doc.brand.address].filter(Boolean).join(" · "), { size: 10, color: { argb: "FF555555" } });
  titleCell(3, generatedLine(doc), { size: 9, color: { argb: "FF777777" } });
  if (doc.subtitle) titleCell(4, doc.subtitle, { size: 10, italic: true, color: { argb: "FF555555" } });
  if (doc.brand.logoPng) {
    const img = wb.addImage({ buffer: doc.brand.logoPng as unknown as ExcelJS.Buffer, extension: "png" });
    ws.addImage(img, { tl: { col: 0.15, row: 0.15 }, ext: { width: 52, height: 52 }, editAs: "oneCell" });
  }

  // Header row.
  const header = ws.getRow(headerRowNo);
  cols.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.type === "money" ? `${columnLabel(c, doc.t)} (${currencyLabel(doc)})` : columnLabel(c, doc.t);
    cell.font = { name: FONT, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: brandArgb } };
    cell.alignment = { ...align(c), wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: brandArgb } } };
  });
  header.height = 22;

  // Data rows.
  const first = headerRowNo + 1;
  doc.rows.forEach((r, ri) => {
    const row = ws.getRow(first + ri);
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const v = r.cells[c.key];
      if (v === null || v === undefined || v === "") cell.value = null;
      else if (c.type === "date" || c.type === "datetime") {
        cell.value = toExcelDate(String(v), doc.timeZone);
        cell.numFmt = "dd mmm yyyy";
      } else {
        cell.value = rawCell(c, v, doc.t);
        if (c.type === "money") cell.numFmt = moneyFmt;
        if (c.type === "number") cell.numFmt = "#,##0.##";
        if (c.type === "percent") cell.numFmt = "0.0%";
      }
      cell.font = { name: FONT, size: 10, bold: !!r.emphasis };
      cell.alignment = align(c);
      if (r.emphasis === "heading" || r.emphasis === "total") cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3EFEC" } };
      else if (ri % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAF8F6" } };
      if (r.emphasis === "total" || r.emphasis === "subtotal") cell.border = { top: { style: r.emphasis === "total" ? "medium" : "thin", color: { argb: "FF8A7F76" } }, bottom: { style: "hair", color: { argb: "FFE6DED6" } } };
      if (!r.emphasis || r.emphasis === "heading") cell.border = { bottom: { style: "hair", color: { argb: "FFE6DED6" } } };
    });
  });

  // Totals with live SUM formulas (cached results so viewers show them immediately).
  if (Object.keys(doc.totals).length && doc.rows.length) {
    const last = first + doc.rows.length - 1;
    const row = ws.getRow(last + 1);
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      if (i === 0) cell.value = doc.t("toolbar.total");
      else if (c.total) {
        const L = colLetter(i);
        cell.value = { formula: `SUM(${L}${first}:${L}${last})`, result: c.type === "money" ? doc.totals[c.key] / 100 : doc.totals[c.key] };
        cell.numFmt = c.type === "money" ? moneyFmt : "#,##0.##";
      }
      cell.font = { name: FONT, bold: true };
      cell.alignment = align(c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: tintArgb } };
      cell.border = { top: { style: "thin", color: { argb: brandArgb } } };
    });
  }

  if (doc.rows.length) ws.autoFilter = { from: { row: headerRowNo, column: 1 }, to: { row: headerRowNo + doc.rows.length, column: cols.length } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
