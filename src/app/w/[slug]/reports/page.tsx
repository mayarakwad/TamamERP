import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { bizPage, i18nFor } from "@/lib/biz";
import { periodOf } from "@/lib/datasets/finance";
import { aging, balanceSheet, cashFlow, profitAndLoss } from "@/lib/ledger/reports";
import { stockValue } from "@/lib/docs/math";
import { pick } from "@/lib/i18n";
import { ReportsIndex } from "@/components/business/reports";

export const metadata: Metadata = { title: "Reports" };

/** Trading reports that mean nothing to a school. */
const SCHOOL_HIDDEN = ["sales-by-customer", "sales-by-item", "stock-valuation"];

export default async function ReportsPage({ params }: PageProps<"/w/[slug]/reports">) {
  const { slug } = await params;
  const ws = await bizPage(slug, ["finance.view"], ["business", "school"]);
  await connection();
  const { t, locale } = await i18nFor(ws);
  const p = periodOf(ws, new URLSearchParams());
  const [pl, bs, cf, ar, ap, top, items] = await Promise.all([
    profitAndLoss(db, ws.org.id, p.from, p.to),
    balanceSheet(db, ws.org.id, p.to),
    cashFlow(db, ws.org.id, p.from, p.to, ws.org.timezone),
    aging(db, ws.org.id, "invoice", new Date()),
    aging(db, ws.org.id, "bill", new Date()),
    db.document.groupBy({ by: ["partyId"], where: { orgId: ws.org.id, kind: "invoice", status: { in: ["issued", "partial", "paid"] }, date: { gte: p.from, lt: p.to } }, _sum: { total: true }, orderBy: { _sum: { total: "desc" } }, take: 1 }),
    db.item.findMany({ where: { orgId: ws.org.id, kind: "product" }, include: { levels: true } }),
  ]);
  const topParty = top[0] ? await db.party.findUnique({ where: { id: top[0].partyId } }) : null;
  const sum = (rows: typeof ar) => rows.reduce((s, r) => s + r.total, 0);
  const overdue = (rows: typeof ar) => rows.reduce((s, r) => s + r.total - r.buckets.current, 0);
  return (
    <ReportsIndex
      slug={slug}
      hide={ws.orgType === "school" ? SCHOOL_HIDDEN : []}
      headlines={{
        pl: { value: pl.netProfit, hint: t("reports.hintNet", { income: (pl.totalIncome / 100).toLocaleString("en", { maximumFractionDigits: 0 }) }) },
        bs: { value: bs.totalAssets, hint: t("reports.hintAssets") },
        cf: { value: cf.closing, hint: t("reports.hintCash") },
        "ar-aging": { value: sum(ar), hint: t("reports.hintOverdue", { amount: (overdue(ar) / 100).toLocaleString("en", { maximumFractionDigits: 0 }) }) },
        "ap-aging": { value: sum(ap), hint: t("reports.hintOverdue", { amount: (overdue(ap) / 100).toLocaleString("en", { maximumFractionDigits: 0 }) }) },
        "sales-by-customer": topParty ? { value: top[0]._sum.total ?? 0, hint: t("reports.hintTop", { name: pick(locale, topParty.name, topParty.nameAr) }) } : { value: 0 },
        "stock-valuation": { value: items.reduce((s, i) => s + stockValue(i.levels.reduce((a, l) => a + l.qty, 0), i.avgCost), 0), hint: t("reports.atAverageCost") },
      }}
    />
  );
}
