import type { MessageKey } from "../i18n";
import type { Permission } from "../rbac";

// A dataset is a table defined once on the server. The page that shows it,
// the Excel/CSV/Word/PDF exports, print, copy and share links all use the
// same definition, so they always agree.

export type ColumnType = "text" | "money" | "date" | "datetime" | "number" | "percent" | "enum";
export type CellValue = string | number | null;

export interface Column {
  key: string;
  label: MessageKey;
  /** Literal header text that replaces the label (e.g. a warehouse name) */
  header?: string;
  type: ColumnType;
  /** Sum this column in a totals row (money/number). */
  total?: boolean;
  /** For enum columns: value → message key. */
  options?: Record<string, MessageKey>;
  /** Relative width hint for exports (characters). */
  width?: number;
  /** Hide on small screens. */
  hideOnMobile?: boolean;
  /** Only in downloads and print (too detailed for the screen) */
  exportOnly?: boolean;
}

export interface Row {
  id: string;
  /** Path inside the workspace this row opens. */
  href?: string;
  cells: Record<string, CellValue>;
  /** Extra values for on-screen rendering (icons, colours, avatars). Not exported. */
  meta?: Record<string, string | number | boolean | null>;
  /** Reports: show this row as a heading, subtotal or total (bold in every format) */
  emphasis?: RowEmphasis;
}

export interface DatasetResult {
  /** Localized title, e.g. "Claims" */
  title: string;
  /** Localized description of the active filters, e.g. "November 2026 · Waiting" */
  subtitle?: string;
  columns: Column[];
  rows: Row[];
}

export interface DatasetContext {
  locale: "en" | "ar";
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

export interface Dataset<W = unknown> {
  id: string;
  /** Any of these permissions may load it (omit = every member; row filtering happens in load). */
  permissions?: Permission[];
  load(ws: W, params: URLSearchParams, ctx: DatasetContext): Promise<DatasetResult>;
}

/** Header text for a column. */
export function columnLabel(c: Column, t: (key: MessageKey) => string) {
  return c.header ?? t(c.label);
}

/** Visual weight of a row in reports (section headings, subtotals, totals). */
export type RowEmphasis = "heading" | "subtotal" | "total";

export function totalsFor(result: DatasetResult): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const c of result.columns) {
    if (!c.total) continue;
    totals[c.key] = result.rows.reduce((s, r) => s + (typeof r.cells[c.key] === "number" ? (r.cells[c.key] as number) : 0), 0);
  }
  return totals;
}
