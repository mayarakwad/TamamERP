import { rawCell } from "../datasets/format-cell";
import { columnLabel } from "../datasets/types";
import { currencyLabel, type ExportDoc } from "./doc";

// CSV that opens correctly in Excel: UTF-8 with a byte-order mark (without it,
// Excel shows Arabic as gibberish), CRLF line endings, RFC 4180 quoting, and
// protection against formula injection.

function cell(value: string | number): string {
  if (typeof value === "number") return String(Math.round(value * 100) / 100);
  let s = value;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // a cell must never run as a formula
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function renderCsv(doc: ExportDoc): Buffer {
  const header = doc.columns.map((c) => cell(c.type === "money" ? `${columnLabel(c, doc.t)} (${currencyLabel(doc)})` : columnLabel(c, doc.t)));
  const lines = [header.join(","), ...doc.rows.map((r) => doc.columns.map((c) => cell(rawCell(c, r.cells[c.key], doc.t))).join(","))];
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(lines.join("\r\n") + "\r\n", "utf8")]);
}
