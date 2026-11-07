import { db } from "@/lib/db";
import { bizPage, i18nFor, toQuery } from "@/lib/biz";
import { customersDataset, suppliersDataset } from "@/lib/datasets/sales";
import { PartiesView } from "@/components/business/parties-view";

/** Customers or suppliers list (shared by both routes). */
export async function PartiesPage({ slug, which, sp }: { slug: string; which: "customer" | "supplier"; sp: Record<string, string | string[] | undefined> }) {
  const ws = await bizPage(slug, ["finance.view"]);
  const query = toQuery(sp);
  const { locale, t } = await i18nFor(ws);
  const kind = which === "customer" ? "invoice" : "bill";
  const [result, open, overdue, count] = await Promise.all([
    (which === "customer" ? customersDataset : suppliersDataset).load(ws, query, { locale, t }),
    db.document.aggregate({ where: { orgId: ws.org.id, kind, status: { in: ["issued", "posted", "partial"] } }, _sum: { total: true, paid: true } }),
    db.document.aggregate({ where: { orgId: ws.org.id, kind, status: { in: ["issued", "posted", "partial"] }, dueDate: { lt: new Date() } }, _sum: { total: true, paid: true } }),
    db.party.count({ where: { orgId: ws.org.id, archived: false, ...(which === "customer" ? { isCustomer: true } : { isSupplier: true }) } }),
  ]);
  return (
    <PartiesView
      slug={slug}
      which={which}
      query={query.toString()}
      result={result}
      canShare={ws.can("exports.share")}
      canManage={ws.can("finance.manage")}
      summary={{ count, open: (open._sum.total ?? 0) - (open._sum.paid ?? 0), overdue: (overdue._sum.total ?? 0) - (overdue._sum.paid ?? 0) }}
    />
  );
}
