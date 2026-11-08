import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { bizPage } from "@/lib/biz";
import { addMonths, monthKey, monthStart } from "@/lib/format";
import { getThread } from "@/lib/thread";
import { ItemDetail } from "@/components/business/item-detail";

export const metadata: Metadata = { title: "Item" };

const DOC_PATH: Record<string, string> = { invoice: "sales/invoices", bill: "purchases/bills", po: "purchases/orders", quote: "sales/quotations" };

export default async function ItemPage({ params }: PageProps<"/w/[slug]/inventory/items/[id]">) {
  const { slug, id } = await params;
  const ws = await bizPage(slug, ["finance.view", "inventory.manage"]);
  await connection();
  const item = await db.item.findFirst({ where: { id, orgId: ws.org.id }, include: { levels: true } });
  if (!item) notFound();
  const now = new Date();
  const thisMonth = monthKey(now, ws.org.timezone);
  const from = monthStart(addMonths(thisMonth, -11));
  const [moves, sold, thread, cats] = await Promise.all([
    db.stockMove.findMany({ where: { itemId: id }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 12, include: { campus: true } }),
    db.documentLine.findMany({ where: { itemId: id, document: { kind: "invoice", status: { in: ["issued", "partial", "paid"] }, date: { gte: from } } }, select: { qty: true, document: { select: { date: true } } } }),
    getThread(ws.org.id, "item", id),
    db.item.findMany({ where: { orgId: ws.org.id, category: { not: null } }, distinct: ["category"], select: { category: true } }),
  ]);
  const docs = new Map((await db.document.findMany({ where: { id: { in: moves.filter((m) => m.sourceId && (m.sourceType === "document" || m.sourceType === "void")).map((m) => m.sourceId!) } }, select: { id: true, number: true, kind: true } })).map((d) => [d.id, d]));
  const months = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, i - 11));
  const byMonth = new Map(months.map((m) => [m, 0]));
  for (const l of sold) {
    const k = monthKey(l.document.date, ws.org.timezone);
    byMonth.set(k, (byMonth.get(k) ?? 0) + l.qty);
  }
  return (
    <ItemDetail
      slug={slug}
      item={{ id: item.id, sku: item.sku, name: item.name, nameAr: item.nameAr, kind: item.kind, category: item.category, unit: item.unit, salePrice: item.salePrice, purchasePrice: item.purchasePrice, reorderLevel: item.reorderLevel, reorderQty: item.reorderQty, barcode: item.barcode, avgCost: item.avgCost, archived: item.archived }}
      levels={ws.org.campuses.map((c) => ({ campusId: c.id, name: c.name, nameAr: c.nameAr, qty: item.levels.find((l) => l.campusId === c.id)?.qty ?? 0 }))}
      months={months.map((m) => ({ month: m, total: ws.can("finance.view") ? Math.round(((byMonth.get(m) ?? 0) * item.salePrice) / 100) : (byMonth.get(m) ?? 0) / 100 }))}
      moves={moves.map((m) => {
        const d = m.sourceId ? docs.get(m.sourceId) : undefined;
        return { id: m.id, date: m.date.toISOString(), kind: m.kind, qty: m.qty, warehouse: ws.viewer.prefs.locale === "ar" ? (m.campus.nameAr ?? m.campus.name) : m.campus.name, ref: d?.number ?? m.note ?? "", href: d ? `${DOC_PATH[d.kind]}/${d.id}` : null };
      })}
      categories={cats.map((c) => c.category!)}
      thread={thread}
      viewerId={ws.viewer.id}
      now={now.toISOString()}
      canManage={ws.can("finance.manage") || ws.can("inventory.manage")}
      canPrice={ws.can("finance.manage")}
      showCost={ws.can("finance.view")}
    />
  );
}
