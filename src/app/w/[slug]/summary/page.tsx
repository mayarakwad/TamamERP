import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth/dal";
import { getI18n } from "@/lib/i18n/server";
import { summaryDataset } from "@/lib/datasets/home";
import { getMonthBudget } from "@/lib/home/budget";
import { addMonths, monthKey, monthStart } from "@/lib/format";
import { SummaryView } from "./summary-view";

export const metadata: Metadata = { title: "Monthly summary" };

export default async function SummaryPage({ params, searchParams }: PageProps<"/w/[slug]/summary">) {
  const { slug } = await params;
  const ws = await requirePermission(slug, "claims.viewAll");
  if (ws.orgType !== "home") notFound();
  const sp = await searchParams;
  const current = monthKey(new Date(), ws.org.timezone);
  // Default to the last complete month.
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : addMonths(current, -1);
  const from = monthStart(month);
  const to = monthStart(addMonths(month, 1));
  const { locale, t } = await getI18n();

  const [result, cats, prevCats, claims, bills] = await Promise.all([
    summaryDataset.load(ws, new URLSearchParams({ month }), { locale, t }),
    getMonthBudget(ws.org.id, month),
    getMonthBudget(ws.org.id, addMonths(month, -1)),
    db.claim.findMany({
      where: { orgId: ws.org.id, deletedAt: null, status: { in: ["approved", "reimbursed"] }, spentOn: { gte: from, lt: to } },
      include: { submittedBy: { select: { id: true, name: true, nameAr: true, avatarColor: true } }, category: { select: { name: true, nameAr: true, icon: true } } },
      orderBy: { amount: "desc" },
    }),
    db.billPayment.findMany({ where: { orgId: ws.org.id, status: "paid", paidOn: { gte: from, lt: to } }, include: { bill: true }, orderBy: { paidOn: "asc" } }),
  ]);

  const people = new Map<string, { id: string; name: string; nameAr: string | null; avatarColor: string | null; amount: number; count: number }>();
  for (const c of claims) {
    const p = people.get(c.submittedById) ?? { ...c.submittedBy, amount: 0, count: 0 };
    p.amount += c.amount;
    p.count += 1;
    people.set(c.submittedById, p);
  }
  const days = Math.round((to.getTime() - from.getTime()) / 86400_000);
  const daily = Array.from({ length: days }, () => 0);
  const dayOf = (d: Date) => Math.floor((d.getTime() - from.getTime()) / 86400_000);
  for (const c of claims) daily[Math.min(days - 1, dayOf(c.spentOn))] += c.amount;
  for (const b of bills) daily[Math.min(days - 1, dayOf(b.paidOn!))] += b.amount;

  return (
    <SummaryView
      slug={slug}
      month={month}
      currentMonth={current}
      result={result}
      canShare={ws.can("exports.share")}
      categories={cats.map((c) => ({ id: c.id, name: c.name, nameAr: c.nameAr, icon: c.icon, color: c.color, spent: c.spent, budget: c.budget, last: prevCats.find((p) => p.id === c.id)?.spent ?? 0 }))}
      people={[...people.values()].sort((a, b) => b.amount - a.amount)}
      biggest={claims.slice(0, 5).map((c) => ({ id: c.id, merchant: c.merchant, amount: c.amount, spentOn: c.spentOn.toISOString(), by: c.submittedBy.name, byAr: c.submittedBy.nameAr, icon: c.category.icon }))}
      bills={bills.map((b) => ({ id: b.id, name: b.bill.name, nameAr: b.bill.nameAr, amount: b.amount, paidOn: b.paidOn!.toISOString() }))}
      daily={daily}
      claimCount={claims.length}
    />
  );
}
