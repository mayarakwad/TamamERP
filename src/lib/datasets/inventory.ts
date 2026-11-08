import "server-only";
import { db } from "../db";
import type { Workspace } from "../auth/dal";
import { pick } from "../i18n";
import { stockValue } from "../docs/math";
import type { Column, Dataset, DatasetResult } from "./types";

/** Items with stock on hand across warehouses, value and low-stock flag. */
export const itemsDataset: Dataset<Workspace> = {
  id: "items",
  permissions: ["finance.view", "inventory.manage"],
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const q = params.get("q")?.trim();
    const category = params.get("category");
    const items = await db.item.findMany({
      where: {
        orgId: ws.org.id,
        archived: params.get("archived") === "1",
        ...(params.get("kind") ? { kind: params.get("kind")! } : {}),
        ...(category ? { category } : {}),
        ...(q ? { OR: [{ name: { contains: q } }, { nameAr: { contains: q } }, { sku: { contains: q.toUpperCase() } }, { barcode: { contains: q } }] } : {}),
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: { levels: true },
    });
    const showCost = ws.can("finance.view");
    let rows = items.map((i) => {
      const qty = i.levels.reduce((s, l) => s + l.qty, 0);
      const low = i.kind === "product" && i.reorderLevel != null && qty <= i.reorderLevel;
      return {
        id: i.id,
        href: `inventory/items/${i.id}`,
        cells: {
          sku: i.sku,
          name: pick(locale, i.name, i.nameAr),
          category: i.category,
          unit: i.unit,
          onHand: i.kind === "product" ? qty / 100 : null,
          reorder: i.reorderLevel != null ? i.reorderLevel / 100 : null,
          price: i.salePrice,
          cost: showCost ? i.avgCost : null,
          value: showCost && i.kind === "product" ? stockValue(qty, i.avgCost) : null,
          state: i.kind === "service" ? "service" : low ? (qty <= 0 ? "out" : "low") : "ok",
        },
        meta: { kind: i.kind },
      };
    });
    if (params.get("low") === "1") rows = rows.filter((r) => r.cells.state === "low" || r.cells.state === "out");
    const columns: Column[] = [
      { key: "sku", label: "items.colSku", type: "text", width: 12 },
      { key: "name", label: "items.colName", type: "text", width: 34 },
      { key: "category", label: "items.colCategory", type: "text", width: 16, hideOnMobile: true },
      { key: "unit", label: "items.colUnit", type: "text", width: 8, hideOnMobile: true },
      { key: "onHand", label: "items.colOnHand", type: "number", width: 11 },
      { key: "reorder", label: "items.colReorder", type: "number", width: 11, hideOnMobile: true },
      { key: "price", label: "items.colPrice", type: "money", width: 13, hideOnMobile: true },
      ...(showCost
        ? [
            { key: "cost", label: "items.colCost" as const, type: "money" as const, width: 13, hideOnMobile: true },
            { key: "value", label: "items.colValue" as const, type: "money" as const, total: true, width: 15 },
          ]
        : []),
      { key: "state", label: "items.colState", type: "enum", options: { ok: "items.inStock", low: "items.low", out: "items.out", service: "items.service" }, width: 12 },
    ];
    return { title: t("nav.items"), subtitle: params.get("low") === "1" ? t("items.lowOnly") : undefined, columns, rows };
  },
};

/** Quantity per warehouse, one column per branch. */
export const stockDataset: Dataset<Workspace> = {
  id: "stock",
  permissions: ["finance.view", "inventory.manage"],
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const campuses = ws.org.campuses;
    const q = params.get("q")?.trim();
    const items = await db.item.findMany({
      where: { orgId: ws.org.id, kind: "product", archived: false, ...(q ? { OR: [{ name: { contains: q } }, { nameAr: { contains: q } }, { sku: { contains: q.toUpperCase() } }] } : {}) },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: { levels: true },
    });
    const showCost = ws.can("finance.view");
    return {
      title: t("stock.title"),
      columns: [
        { key: "sku", label: "items.colSku", type: "text", width: 12 },
        { key: "name", label: "items.colName", type: "text", width: 32 },
        ...campuses.map((c) => ({ key: `c_${c.id}`, label: "stock.warehouse" as const, type: "number" as const, width: 12, header: pick(locale, c.name, c.nameAr) })),
        { key: "total", label: "stock.total", type: "number", width: 11 },
        ...(showCost ? [{ key: "value", label: "items.colValue" as const, type: "money" as const, total: true, width: 15 }] : []),
      ],
      rows: items.map((i) => {
        const total = i.levels.reduce((s, l) => s + l.qty, 0);
        return {
          id: i.id,
          href: `inventory/items/${i.id}`,
          cells: {
            sku: i.sku,
            name: pick(locale, i.name, i.nameAr),
            ...Object.fromEntries(campuses.map((c) => [`c_${c.id}`, (i.levels.find((l) => l.campusId === c.id)?.qty ?? 0) / 100])),
            total: total / 100,
            value: showCost ? stockValue(total, i.avgCost) : null,
          },
          meta: { low: i.reorderLevel != null && total <= i.reorderLevel },
        };
      }),
    };
  },
};

/** Every stock movement, newest first. */
export const stockMovesDataset: Dataset<Workspace> = {
  id: "stock-moves",
  permissions: ["finance.view", "inventory.manage"],
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const itemId = params.get("item");
    const campusId = params.get("campus");
    const q = params.get("q")?.trim();
    const moves = await db.stockMove.findMany({
      where: {
        orgId: ws.org.id,
        ...(itemId ? { itemId } : {}),
        ...(campusId ? { campusId } : {}),
        ...(params.get("kind") ? { kind: params.get("kind")! } : {}),
        ...(q ? { item: { OR: [{ name: { contains: q } }, { nameAr: { contains: q } }, { sku: { contains: q.toUpperCase() } }] } } : {}),
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: { item: { select: { sku: true, name: true, nameAr: true } }, campus: { select: { name: true, nameAr: true } } },
      take: 2000,
    });
    const docIds = [...new Set(moves.filter((m) => m.sourceType === "document" && m.sourceId).map((m) => m.sourceId!))];
    const docs = new Map((await db.document.findMany({ where: { id: { in: docIds } }, select: { id: true, number: true, kind: true } })).map((d) => [d.id, d]));
    return {
      title: t("stock.moves"),
      columns: [
        { key: "date", label: "docs.colDate", type: "date", width: 13 },
        { key: "item", label: "items.colName", type: "text", width: 30 },
        { key: "warehouse", label: "stock.warehouse", type: "text", width: 22, hideOnMobile: true },
        { key: "kind", label: "stock.colKind", type: "enum", options: { opening: "stock.kindOpening", receipt: "stock.kindReceipt", sale: "stock.kindSale", adjustment: "stock.kindAdjustment", transfer: "stock.kindTransfer" }, width: 14 },
        { key: "ref", label: "docs.colReference", type: "text", width: 18, hideOnMobile: true },
        { key: "qty", label: "stock.colQty", type: "number", width: 10 },
        { key: "cost", label: "items.colCost", type: "money", width: 12, hideOnMobile: true },
      ],
      rows: moves.map((m) => {
        const doc = m.sourceId ? docs.get(m.sourceId) : undefined;
        return {
          id: m.id,
          href: doc ? `${doc.kind === "invoice" ? "sales/invoices" : doc.kind === "bill" ? "purchases/bills" : "purchases/orders"}/${doc.id}` : undefined,
          cells: {
            date: m.date.toISOString(),
            item: `${m.item.sku} · ${pick(locale, m.item.name, m.item.nameAr)}`,
            warehouse: pick(locale, m.campus.name, m.campus.nameAr),
            kind: m.kind,
            ref: doc?.number ?? m.note ?? "",
            qty: m.qty / 100,
            cost: m.unitCost,
          },
        };
      }),
    };
  },
};
