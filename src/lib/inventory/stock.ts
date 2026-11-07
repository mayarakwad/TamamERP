// Stock movements. Every change goes through moveStock(), which keeps the
// per-warehouse StockLevel and the item's moving-average cost in step and
// raises a low-stock alert when an item drops to its reorder level.
// No server-only imports: the seed script uses this too.

import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { movingAverage, stockValue } from "../docs/math";
import { notify } from "../notify";

type Db = PrismaClient | Prisma.TransactionClient;

export interface MoveInput {
  orgId: string;
  itemId: string;
  campusId: string;
  /** hundredths; positive in, negative out */
  qty: number;
  /** Cost per unit for incoming stock; outgoing stock uses the average cost */
  unitCost?: number;
  date: Date;
  kind: "opening" | "receipt" | "sale" | "adjustment" | "transfer";
  sourceType?: string | null;
  sourceId?: string | null;
  note?: string | null;
  createdById?: string | null;
  /** Skip the low-stock check (bulk imports) */
  quiet?: boolean;
}

/** The demo seed turns alerts off while it builds a year of history. */
export const stockAlerts = { enabled: true };

export async function onHand(db: Db, itemId: string, campusId?: string) {
  const r = await db.stockLevel.aggregate({ where: { itemId, ...(campusId ? { campusId } : {}) }, _sum: { qty: true } });
  return r._sum.qty ?? 0;
}

/** Record a movement. Returns the value moved in dirhams (positive in, negative out). */
export async function moveStock(db: Db, m: MoveInput): Promise<{ value: number; unitCost: number }> {
  if (m.qty === 0) return { value: 0, unitCost: 0 };
  const item = await db.item.findFirstOrThrow({ where: { id: m.itemId, orgId: m.orgId } });
  let unitCost = item.avgCost;
  if (m.qty > 0) {
    unitCost = m.unitCost ?? item.avgCost;
    // Transfers in carry the average already; everything else updates it.
    if (m.kind !== "transfer") {
      const total = await onHand(db, m.itemId);
      const avgCost = movingAverage(total, item.avgCost, m.qty, unitCost);
      await db.item.update({ where: { id: item.id }, data: { avgCost, ...(m.kind === "receipt" ? { purchasePrice: unitCost } : {}) } });
    }
  }
  await db.stockMove.create({
    data: {
      orgId: m.orgId,
      itemId: m.itemId,
      campusId: m.campusId,
      date: m.date,
      qty: m.qty,
      unitCost,
      kind: m.kind,
      sourceType: m.sourceType ?? null,
      sourceId: m.sourceId ?? null,
      note: m.note ?? null,
      createdById: m.createdById ?? null,
    },
  });
  await db.stockLevel.upsert({
    where: { itemId_campusId: { itemId: m.itemId, campusId: m.campusId } },
    create: { orgId: m.orgId, itemId: m.itemId, campusId: m.campusId, qty: m.qty },
    update: { qty: { increment: m.qty } },
  });
  if (!m.quiet && stockAlerts.enabled) await checkLowStock(db, m.orgId, m.itemId);
  return { value: stockValue(m.qty, unitCost), unitCost };
}

/** People who look after stock: owners, admins, accountants and anyone granted inventory.manage. */
export async function stockKeepers(db: Db, orgId: string) {
  const rows = await db.membership.findMany({ where: { orgId, status: "active" }, select: { userId: true, role: true, extraPermissions: true } });
  return rows.filter((r) => ["owner", "admin", "accountant"].includes(r.role) || (r.extraPermissions ?? "").includes("inventory.manage")).map((r) => r.userId);
}

/** Alert once when an item reaches its reorder level; re-arm when it's back above. */
export async function checkLowStock(db: Db, orgId: string, itemId: string) {
  const item = await db.item.findUnique({ where: { id: itemId } });
  if (!item || item.kind !== "product" || item.reorderLevel == null) return;
  const qty = await onHand(db, itemId);
  if (qty <= item.reorderLevel && !item.lowStockAlertedAt) {
    await db.item.update({ where: { id: itemId }, data: { lowStockAlertedAt: new Date() } });
    const left = (qty / 100).toLocaleString("en");
    await notify(db, {
      orgId,
      userIds: await stockKeepers(db, orgId),
      kind: "stock.low",
      title: `Low stock: ${item.name} (${left} ${item.unit} left)`,
      titleAr: `مخزون منخفض: ${item.nameAr ?? item.name} (متبقٍ ${left})`,
      href: `inventory/items/${item.id}`,
    });
  } else if (qty > item.reorderLevel && item.lowStockAlertedAt) {
    await db.item.update({ where: { id: itemId }, data: { lowStockAlertedAt: null } });
  }
}
