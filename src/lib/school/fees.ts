// What a family owes for one installment. Pure functions, unit-tested.
// Money is whole dirhams; discounts are basis points (1000 = 10%).

import type { Installment, SchoolSettings } from "./settings";

export interface FeeStudentInput {
  /** 0 for the eldest child in the family at the school, 1 for the next … */
  childOrder: number;
  discountKind: string | null;
  discountPct: number;
  /** Yearly transport fee for the student's bus, 0 if none */
  transportFee: number;
}

export interface FeeLine {
  component: "tuition" | "books" | "transport" | "registration";
  /** dirhams before discount */
  amount: number;
  discountPct: number;
  /** why there's a discount: sibling | staff | scholarship */
  discountReason: string | null;
}

/** Split a yearly amount by installment percentages; the last one takes the rounding. Whole riyals. */
export function splitYearly(amount: number, installments: Installment[]): number[] {
  const parts = installments.map((i) => Math.round((amount * i.pct) / 100 / 100) * 100);
  const diff = amount - parts.reduce((s, x) => s + x, 0);
  if (parts.length) parts[parts.length - 1] += diff;
  return parts;
}

/** The tuition discount that applies: the larger of the sibling discount and a staff/scholarship one. */
export function tuitionDiscount(s: FeeStudentInput, settings: Pick<SchoolSettings, "sibling" | "staffDiscount">): { pct: number; reason: string | null } {
  const ladder = settings.sibling;
  const sibling = ladder.length ? ladder[Math.min(s.childOrder, ladder.length - 1)] : 0;
  const own = s.discountKind === "staff" ? settings.staffDiscount : s.discountKind === "scholarship" ? s.discountPct : 0;
  if (own >= sibling && own > 0) return { pct: own, reason: s.discountKind };
  if (sibling > 0) return { pct: sibling, reason: "sibling" };
  return { pct: 0, reason: null };
}

/** Lines for installment `index` of the year. Books are billed with the first installment. */
export function installmentLines(
  s: FeeStudentInput,
  rates: { tuition: number; books: number },
  index: number,
  settings: Pick<SchoolSettings, "installments" | "sibling" | "staffDiscount">,
): FeeLine[] {
  const lines: FeeLine[] = [];
  const disc = tuitionDiscount(s, settings);
  const tuition = splitYearly(rates.tuition, settings.installments)[index] ?? 0;
  if (tuition > 0) lines.push({ component: "tuition", amount: tuition, discountPct: disc.pct, discountReason: disc.reason });
  if (index === 0 && rates.books > 0) lines.push({ component: "books", amount: rates.books, discountPct: 0, discountReason: null });
  const transport = s.transportFee > 0 ? (splitYearly(s.transportFee, settings.installments)[index] ?? 0) : 0;
  if (transport > 0) lines.push({ component: "transport", amount: transport, discountPct: 0, discountReason: null });
  return lines;
}

/** Order children in a family: eldest first (earliest date of birth), then by id for stability. */
export function childOrders<T extends { id: string; dob: Date; familyKey: string | null }>(students: T[]): Map<string, number> {
  const families = new Map<string, T[]>();
  for (const s of students) {
    const key = s.familyKey ?? `solo:${s.id}`;
    families.set(key, [...(families.get(key) ?? []), s]);
  }
  const out = new Map<string, number>();
  for (const kids of families.values()) {
    kids.sort((a, b) => a.dob.getTime() - b.dob.getTime() || a.id.localeCompare(b.id));
    kids.forEach((k, i) => out.set(k.id, i));
  }
  return out;
}
