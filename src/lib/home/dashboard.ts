import "server-only";
import { db } from "../db";
import { addMonths, monthKey, monthStart } from "../format";
import type { Workspace } from "../auth/dal";

const DAY = 86400_000;

/** Everything the Home dashboard shows, computed for the person looking at it. */
export async function getHomeDashboard(ws: Workspace, now: Date) {
  const orgId = ws.org.id;
  const tz = ws.org.timezone;
  const seeAll = ws.can("claims.viewAll");
  const mine = seeAll ? {} : { submittedById: ws.viewer.id };

  const thisMonth = monthKey(now, tz);
  const from = monthStart(thisMonth);
  const trendFrom = monthStart(addMonths(thisMonth, -5));
  const counted = { in: ["approved", "reimbursed"] };

  const [categories, budgets, monthClaims, pendingClaims, trendClaims, trendBills, monthBills, upcoming, warranties, activity] = await Promise.all([
    db.expenseCategory.findMany({ where: { orgId, archived: false }, orderBy: { sort: "asc" } }),
    db.budget.findMany({ where: { orgId, month: { in: ["default", thisMonth] } } }),
    db.claim.groupBy({ by: ["categoryId", "status"], where: { orgId, deletedAt: null, spentOn: { gte: from }, status: { in: ["approved", "reimbursed", "submitted"] } }, _sum: { amount: true } }),
    db.claim.findMany({
      where: { orgId, deletedAt: null, status: "submitted", ...mine },
      orderBy: { spentOn: "desc" },
      take: 6,
      include: { submittedBy: { select: { name: true, nameAr: true, avatarColor: true } }, category: { select: { key: true, name: true, nameAr: true, icon: true } } },
    }),
    db.claim.findMany({ where: { orgId, deletedAt: null, spentOn: { gte: trendFrom }, status: counted }, select: { amount: true, spentOn: true } }),
    db.billPayment.findMany({ where: { orgId, status: "paid", paidOn: { gte: trendFrom } }, select: { amount: true, paidOn: true, bill: { select: { categoryId: true } } } }),
    db.billPayment.findMany({ where: { orgId, status: "paid", paidOn: { gte: from } }, select: { amount: true, bill: { select: { categoryId: true } } } }),
    db.billPayment.findMany({
      where: { orgId, status: "due" },
      orderBy: { dueOn: "asc" },
      take: 5,
      include: { bill: { select: { name: true, nameAr: true, provider: true, autopay: true, variable: true } } },
    }),
    db.possession.findMany({
      where: { orgId, warrantyUntil: { gte: now, lte: new Date(now.getTime() + 90 * DAY) } },
      orderBy: { warrantyUntil: "asc" },
      take: 4,
    }),
    db.auditLog.findMany({
      where: { orgId, entityType: "claim", ...(seeAll ? {} : { userId: ws.viewer.id }) },
      orderBy: { createdAt: "desc" },
      take: 7,
    }),
  ]);

  // Spending this month per category (approved + reimbursed, plus paid bills), and pending separately.
  const spent = new Map<string, number>();
  const pending = new Map<string, number>();
  for (const row of monthClaims) {
    const target = row.status === "submitted" ? pending : spent;
    target.set(row.categoryId, (target.get(row.categoryId) ?? 0) + (row._sum.amount ?? 0));
  }
  for (const b of monthBills) spent.set(b.bill.categoryId, (spent.get(b.bill.categoryId) ?? 0) + b.amount);

  const budgetFor = (categoryId: string) =>
    budgets.find((b) => b.categoryId === categoryId && b.month === thisMonth)?.amount ??
    budgets.find((b) => b.categoryId === categoryId && b.month === "default")?.amount ??
    0;

  const byCategory = categories
    .map((c) => ({
      id: c.id,
      key: c.key,
      name: c.name,
      nameAr: c.nameAr,
      icon: c.icon,
      color: c.color,
      spent: spent.get(c.id) ?? 0,
      pending: pending.get(c.id) ?? 0,
      budget: budgetFor(c.id),
    }))
    .sort((a, b) => b.spent - a.spent);

  const totalSpent = byCategory.reduce((s, c) => s + c.spent, 0);
  const totalBudget = byCategory.reduce((s, c) => s + c.budget, 0);

  // Six-month trend.
  const months = Array.from({ length: 6 }, (_, i) => addMonths(thisMonth, i - 5));
  const trendMap = new Map(months.map((m) => [m, 0]));
  for (const c of trendClaims) {
    const k = monthKey(c.spentOn, tz);
    if (trendMap.has(k)) trendMap.set(k, trendMap.get(k)! + c.amount);
  }
  for (const b of trendBills) {
    const k = monthKey(b.paidOn!, tz);
    if (trendMap.has(k)) trendMap.set(k, trendMap.get(k)! + b.amount);
  }
  const trend = months.map((m) => ({ month: m, date: monthStart(m).toISOString(), amount: trendMap.get(m)! }));
  const lastMonth = trend[4]?.amount ?? 0;
  // Compare like with like: last month up to the same day.
  const dayOfMonth = Math.max(1, Math.round((now.getTime() - from.getTime()) / DAY));
  const daysInLast = Math.round((from.getTime() - monthStart(addMonths(thisMonth, -1)).getTime()) / DAY);
  const lastMonthToDate = Math.round(lastMonth * Math.min(1, dayOfMonth / daysInLast));

  const pendingCount = await db.claim.count({ where: { orgId, deletedAt: null, status: "submitted", ...mine } });
  const billsDueSoon = await db.billPayment.count({ where: { orgId, status: "due", dueOn: { lte: new Date(now.getTime() + 7 * DAY) } } });

  const userIds = [...new Set(activity.map((a) => a.userId).filter(Boolean))] as string[];
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, nameAr: true, avatarColor: true } });

  return {
    month: thisMonth,
    totalSpent,
    totalBudget,
    lastMonthToDate,
    pendingCount,
    billsDueSoon,
    byCategory,
    trend,
    pendingClaims: pendingClaims.map((c) => ({
      id: c.id,
      number: c.number,
      amount: c.amount,
      merchant: c.merchant,
      spentOn: c.spentOn.toISOString(),
      by: c.submittedBy,
      category: c.category,
    })),
    upcoming: upcoming.map((u) => ({ id: u.id, dueOn: u.dueOn.toISOString(), amount: u.amount, ...u.bill })),
    warranties: warranties.map((w) => ({ id: w.id, name: w.name, nameAr: w.nameAr, warrantyUntil: w.warrantyUntil!.toISOString(), store: w.store })),
    activity: activity.map((a) => ({
      id: a.id,
      action: a.action,
      summary: a.summary,
      summaryAr: a.summaryAr,
      createdAt: a.createdAt.toISOString(),
      user: users.find((u) => u.id === a.userId) ?? null,
    })),
  };
}

export type HomeDashboardData = Awaited<ReturnType<typeof getHomeDashboard>>;
