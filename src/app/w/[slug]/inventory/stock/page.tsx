import type { Metadata } from "next";
import { db } from "@/lib/db";
import { bizPage, i18nFor, toQuery } from "@/lib/biz";
import { stockDataset, stockMovesDataset } from "@/lib/datasets/inventory";
import { StockView } from "@/components/business/stock-view";

export const metadata: Metadata = { title: "Stock" };

export default async function StockPage({ params, searchParams }: PageProps<"/w/[slug]/inventory/stock">) {
  const { slug } = await params;
  const ws = await bizPage(slug, ["finance.view", "inventory.manage"]);
  const query = toQuery(await searchParams);
  const view = query.get("view") === "moves" ? "moves" : "levels";
  const { locale, t } = await i18nFor(ws);
  const [result, items] = await Promise.all([
    (view === "moves" ? stockMovesDataset : stockDataset).load(ws, query, { locale, t }),
    db.item.findMany({ where: { orgId: ws.org.id, kind: "product", archived: false }, orderBy: [{ category: "asc" }, { name: "asc" }], include: { levels: true } }),
  ]);
  return (
    <StockView
      slug={slug}
      query={query.toString()}
      view={view}
      result={result}
      canShare={ws.can("exports.share")}
      canManage={ws.can("inventory.manage")}
      campuses={ws.org.campuses.map((c) => ({ id: c.id, name: c.name, nameAr: c.nameAr }))}
      items={items.map((i) => ({ id: i.id, sku: i.sku, name: i.name, nameAr: i.nameAr, unit: i.unit, levels: Object.fromEntries(i.levels.map((l) => [l.campusId, l.qty])) }))}
    />
  );
}
