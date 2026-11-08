import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getWorkspace } from "@/lib/auth/dal";
import { getI18n } from "@/lib/i18n/server";
import { claimsDataset, claimsWhere } from "@/lib/datasets/claims";
import { addMonths, monthKey, monthStart } from "@/lib/format";
import { ClaimsView } from "./claims-view";

export const metadata: Metadata = { title: "Claims" };

export default async function ClaimsPage({ params, searchParams }: PageProps<"/w/[slug]/claims">) {
  const { slug } = await params;
  const ws = await getWorkspace(slug);
  const sp = await searchParams;
  const query = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));
  const { locale, t } = await getI18n({ currency: ws.org.currency, timeZone: ws.org.timezone });

  const thisMonth = monthKey(new Date(), ws.org.timezone);
  const statusFree = new URLSearchParams(query);
  statusFree.delete("status");
  const [result, categories, people, counts, monthTotal] = await Promise.all([
    claimsDataset.load(ws, query, { locale, t }),
    db.expenseCategory.findMany({ where: { orgId: ws.org.id, archived: false }, orderBy: { sort: "asc" } }),
    ws.can("claims.viewAll")
      ? db.membership.findMany({ where: { orgId: ws.org.id, status: "active" }, include: { user: { select: { id: true, name: true, nameAr: true } } } })
      : Promise.resolve([]),
    db.claim.groupBy({ by: ["status"], where: claimsWhere(ws, statusFree), _count: { _all: true } }),
    db.claim.aggregate({
      where: { ...claimsWhere(ws, new URLSearchParams()), status: { in: ["approved", "reimbursed"] }, spentOn: { gte: monthStart(thisMonth) } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);
  const recentMerchants = await db.claim.findMany({
    where: { orgId: ws.org.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { merchant: true },
    take: 200,
  });

  return (
    <ClaimsView
      slug={slug}
      query={query.toString()}
      result={result}
      categories={categories.map((c) => ({ id: c.id, key: c.key, name: c.name, nameAr: c.nameAr, icon: c.icon }))}
      people={people.map((m) => ({ id: m.user.id, name: m.user.name, nameAr: m.user.nameAr }))}
      months={Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, -i))}
      counts={Object.fromEntries(counts.map((c) => [c.status, c._count._all]))}
      monthApproved={monthTotal._sum.amount ?? 0}
      canApprove={ws.can("claims.approve")}
      canShare={ws.can("exports.share")}
      merchants={[...new Set(recentMerchants.map((m) => m.merchant))].slice(0, 40)}
    />
  );
}
