import "server-only";
import { db } from "../db";
import { addMonths, monthStart } from "../format";

export interface CategoryMonth {
  id: string;
  key: string;
  name: string;
  nameAr: string;
  icon: string;
  color: string;
  budget: number;
  /** "month" when this month has its own budget, otherwise "default" */
  budgetSource: "month" | "default" | "none";
  defaultBudget: number;
  spent: number;
  pending: number;
}

/** Budget, spending (approved claims + paid bills) and pending claims per category for one month. */
export async function getMonthBudget(orgId: string, month: string): Promise<CategoryMonth[]> {
  const from = monthStart(month);
  const to = monthStart(addMonths(month, 1));
  const [categories, budgets, claims, bills] = await Promise.all([
    db.expenseCategory.findMany({ where: { orgId, archived: false }, orderBy: { sort: "asc" } }),
    db.budget.findMany({ where: { orgId, month: { in: ["default", month] } } }),
    db.claim.groupBy({ by: ["categoryId", "status"], where: { orgId, deletedAt: null, spentOn: { gte: from, lt: to }, status: { in: ["approved", "reimbursed", "submitted"] } }, _sum: { amount: true } }),
    db.billPayment.findMany({ where: { orgId, status: "paid", paidOn: { gte: from, lt: to } }, select: { amount: true, bill: { select: { categoryId: true } } } }),
  ]);
  return categories.map((c) => {
    const own = budgets.find((b) => b.categoryId === c.id && b.month === month);
    const def = budgets.find((b) => b.categoryId === c.id && b.month === "default");
    const sum = (statuses: string[]) => claims.filter((r) => r.categoryId === c.id && statuses.includes(r.status)).reduce((s, r) => s + (r._sum.amount ?? 0), 0);
    return {
      id: c.id,
      key: c.key,
      name: c.name,
      nameAr: c.nameAr,
      icon: c.icon,
      color: c.color,
      budget: own?.amount ?? def?.amount ?? 0,
      budgetSource: own ? "month" : def ? "default" : "none",
      defaultBudget: def?.amount ?? 0,
      spent: sum(["approved", "reimbursed"]) + bills.filter((b) => b.bill.categoryId === c.id).reduce((s, b) => s + b.amount, 0),
      pending: sum(["submitted"]),
    };
  });
}
