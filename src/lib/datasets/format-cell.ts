import type { Formatter } from "../format";
import type { TFunction } from "../i18n";
import type { CellValue, Column } from "./types";

/** Display text for a cell, the same on screen, in print and in Word/PDF. */
export function formatCell(col: Column, value: CellValue, fmt: Formatter, t: TFunction): string {
  if (value === null || value === undefined || value === "") return "";
  switch (col.type) {
    case "money":
      return fmt.money(Number(value), { decimals: true });
    case "number":
      return fmt.number(Number(value));
    case "percent":
      return fmt.percent(Number(value), 1);
    case "date":
      return fmt.date(String(value));
    case "datetime":
      return fmt.dateTime(String(value));
    case "enum":
      return col.options?.[String(value)] ? t(col.options[String(value)]) : String(value);
    default:
      return String(value);
  }
}

/** Plain value for spreadsheets and the clipboard (numbers stay numbers). */
export function rawCell(col: Column, value: CellValue, t: TFunction): string | number {
  if (value === null || value === undefined) return "";
  if (col.type === "money") return Number(value) / 100;
  if (col.type === "number" || col.type === "percent") return Number(value);
  if (col.type === "date") return String(value).slice(0, 10);
  if (col.type === "enum") return col.options?.[String(value)] ? t(col.options[String(value)]) : String(value);
  return String(value);
}
