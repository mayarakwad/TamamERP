import type { Metadata } from "next";
import { db } from "@/lib/db";
import { bizPage, i18nFor, toQuery } from "@/lib/biz";
import { itemsDataset } from "@/lib/datasets/inventory";
import { ItemsView } from "@/components/business/items-view";

export const metadata: Metadata = { title: "Items" };

export default async function ItemsPage({ params, searchParams }: PageProps<"/w/[slug]/inventory/items">) {
  const { slug } = await params;
  const ws = await bizPage(slug, ["finance.view", "inventory.manage"]);
  const query = toQuery(await searchParams);
  const { locale, t } = await i18nFor(ws);
  const [result, all, cats] = await Promise.all([
    itemsDataset.load(ws, query, { locale, t }),
    db.item.findMany({ where: { orgId: ws.org.id, archived: false }, include: { levels: true } }),
    db.item.findMany({ where: { orgId: ws.org.id, category: { not: null } }, distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } }),
  ]);
  const low = all.filter((i) => i.kind === "product" && i.reorderLevel != null && i.levels.reduce((s, l) => s + l.qty, 0) <= i.reorderLevel).length;
  const value = ws.can("finance.view") ? all.reduce((s, i) => s + Math.round((i.levels.reduce((a, l) => a + l.qty, 0) * i.avgCost) / 100), 0) : null;
  return (
    <ItemsView
      slug={slug}
      query={query.toString()}
      result={result}
      canShare={ws.can("exports.share")}
      canManage={ws.can("finance.manage") || ws.can("inventory.manage")}
      canPrice={ws.can("finance.manage")}
      categories={cats.map((c) => c.category!)}
      counts={{ all: all.length, low, services: all.filter((i) => i.kind === "service").length }}
      value={value}
    />
  );
}
