import { db } from "@/lib/db";
import { bizPage, i18nFor, toQuery } from "@/lib/biz";
import { DOC_DATASET, docsWhere } from "@/lib/datasets/sales";
import { monthKey, monthStart } from "@/lib/format";
import type { DocKind } from "@/lib/docs/ops";
import { DocsView } from "@/components/business/docs-view";

/** Quotations, invoices, purchase orders or supplier bills. */
export async function DocsPage({ slug, kind, sp }: { slug: string; kind: DocKind; sp: Record<string, string | string[] | undefined> }) {
  const ws = await bizPage(slug, kind === "po" ? ["finance.view", "inventory.manage"] : ["finance.view"]);
  const query = toQuery(sp);
  const { locale, t } = await i18nFor(ws);
  const now = new Date();
  const statusFree = new URLSearchParams(query);
  statusFree.delete("status");
  const base = docsWhere(ws, kind, statusFree, now);
  const openStatuses = kind === "invoice" ? ["issued", "partial"] : kind === "bill" ? ["posted", "partial"] : kind === "po" ? ["sent", "partial", "received"] : ["draft", "sent", "accepted"];
  const [result, groups, open, overdue, month] = await Promise.all([
    DOC_DATASET[kind].load(ws, query, { locale, t }),
    db.document.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    db.document.aggregate({ where: { ...base, status: { in: openStatuses } }, _sum: { total: true, paid: true }, _count: { _all: true } }),
    db.document.aggregate({ where: { ...base, status: { in: ["issued", "posted", "partial"] }, dueDate: { lt: now } }, _sum: { total: true, paid: true }, _count: { _all: true } }),
    db.document.aggregate({ where: { orgId: ws.org.id, kind, status: { notIn: ["draft", "void", "cancelled", "declined"] }, date: { gte: monthStart(monthKey(now, ws.org.timezone)) } }, _sum: { total: true } }),
  ]);
  const counts: Record<string, number> = Object.fromEntries(groups.map((g) => [g.status, g._count._all]));
  counts.open = open._count._all;
  counts.partReceived = counts.partial ?? 0;
  counts.overdue = overdue._count._all;
  const payable = kind === "invoice" || kind === "bill";
  return (
    <DocsView
      slug={slug}
      kind={kind}
      query={query.toString()}
      result={result}
      canShare={ws.can("exports.share")}
      canCreate={ws.can("finance.manage")}
      counts={counts}
      summary={{
        open: payable ? (open._sum.total ?? 0) - (open._sum.paid ?? 0) : (open._sum.total ?? 0),
        overdue: (overdue._sum.total ?? 0) - (overdue._sum.paid ?? 0),
        month: month._sum.total ?? 0,
      }}
    />
  );
}
