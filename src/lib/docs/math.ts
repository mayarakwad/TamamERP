// Arithmetic for quotations, invoices, purchase orders and bills.
// Money is whole dirhams; quantities are hundredths of a unit (250 = 2.5).

export const QTY = 100;

/** Parse "2.5" / "٢٫٥" / "1,200" into hundredths. */
export function parseQty(input: string): number | null {
  const western = input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[٬,\s]/g, "")
    .replace(/٫/g, ".");
  if (!/^\d+(\.\d{0,2})?$/.test(western)) return null;
  return Math.round(Number(western) * QTY);
}

export const qtyToNumber = (qty: number) => qty / QTY;

export interface LineInput {
  qty: number;
  unitPrice: number;
  /** basis points: 1000 = 10% */
  discountPct?: number;
}

/** Gross (before discount), discount and net amount for one line, in dirhams. */
export function lineParts(l: LineInput) {
  const gross = Math.round((l.qty * l.unitPrice) / QTY);
  const discount = Math.round((gross * (l.discountPct ?? 0)) / 10000);
  return { gross, discount, amount: gross - discount };
}

export function lineAmount(l: LineInput) {
  return lineParts(l).amount;
}

export function docTotals(lines: LineInput[]) {
  let subtotal = 0;
  let discount = 0;
  for (const l of lines) {
    const p = lineParts(l);
    subtotal += p.gross;
    discount += p.discount;
  }
  return { subtotal, discount, total: subtotal - discount };
}

/** Value of a quantity at a unit cost, in dirhams. */
export function stockValue(qty: number, unitCost: number) {
  return Math.round((qty * unitCost) / QTY);
}

/** New moving-average cost after receiving `inQty` at `inCost`. */
export function movingAverage(onHand: number, avgCost: number, inQty: number, inCost: number) {
  if (inQty <= 0) return avgCost;
  if (onHand <= 0) return inCost;
  return Math.round((onHand * avgCost + inQty * inCost) / (onHand + inQty));
}

export type AgingBucket = "current" | "d1_30" | "d31_60" | "d61_90" | "d90";

/** Which aging column an open balance falls in, by days past due. */
export function agingBucket(dueDate: Date, asOf: Date): AgingBucket {
  const days = Math.floor((asOf.getTime() - dueDate.getTime()) / 86400_000);
  if (days <= 0) return "current";
  if (days <= 30) return "d1_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90";
}
