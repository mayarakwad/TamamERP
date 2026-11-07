import "server-only";
import { db } from "../db";
import type { Workspace } from "../auth/dal";
import { pick } from "../i18n";
import { createFormatter, monthKey, monthStart, addMonths } from "../format";
import { getMonthBudget } from "../home/budget";
import type { Dataset, DatasetResult } from "./types";

const monthParam = (ws: Workspace, params: URLSearchParams) => {
  const m = params.get("month");
  return m && /^\d{4}-\d{2}$/.test(m) ? m : monthKey(new Date(), ws.org.timezone);
};

export const budgetsDataset: Dataset<Workspace> = {
  id: "budgets",
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const month = monthParam(ws, params);
    const rows = await getMonthBudget(ws.org.id, month);
    const fmt = createFormatter({ locale, digits: "latn" });
    return {
      title: t("budgets.title"),
      subtitle: fmt.monthName(monthStart(month)),
      columns: [
        { key: "category", label: "budgets.category", type: "text", width: 26 },
        { key: "budget", label: "budgets.totalBudget", type: "money", total: true, width: 16 },
        { key: "spent", label: "budgets.spent", type: "money", total: true, width: 16 },
        { key: "pending", label: "budgets.pending", type: "money", total: true, width: 16, hideOnMobile: true },
        { key: "left", label: "budgets.left", type: "money", total: true, width: 16 },
        { key: "used", label: "budgets.used", type: "percent", width: 11 },
      ],
      rows: rows.map((c) => ({
        id: c.id,
        cells: { category: pick(locale, c.name, c.nameAr), budget: c.budget, spent: c.spent, pending: c.pending, left: c.budget - c.spent, used: c.budget ? c.spent / c.budget : null },
        meta: { icon: c.icon, color: c.color, source: c.budgetSource, defaultBudget: c.defaultBudget },
      })),
    };
  },
};

export const billsDataset: Dataset<Workspace> = {
  id: "bills",
  async load(ws, _params, { locale, t }): Promise<DatasetResult> {
    const bills = await db.recurringBill.findMany({
      where: { orgId: ws.org.id },
      orderBy: [{ active: "desc" }, { nextDue: "asc" }],
      include: { category: true, payments: { where: { status: "paid" }, orderBy: { paidOn: "desc" }, take: 1 } },
    });
    return {
      title: t("bills.title"),
      columns: [
        { key: "name", label: "bills.colName", type: "text", width: 28 },
        { key: "provider", label: "bills.colProvider", type: "text", width: 20 },
        { key: "frequency", label: "bills.colFrequency", type: "enum", options: { monthly: "bills.monthly", quarterly: "bills.quarterly", yearly: "bills.yearly" }, width: 14 },
        { key: "nextDue", label: "bills.colNextDue", type: "date", width: 14 },
        { key: "autopay", label: "bills.colAutopay", type: "enum", options: { yes: "bills.yes", no: "bills.no" }, width: 10, hideOnMobile: true },
        { key: "amount", label: "bills.colAmount", type: "money", total: true, width: 14 },
      ],
      rows: bills.map((b) => ({
        id: b.id,
        href: `bills?bill=${b.id}`,
        cells: { name: pick(locale, b.name, b.nameAr), provider: b.provider, frequency: b.frequency, nextDue: b.active ? b.nextDue.toISOString() : null, autopay: b.autopay ? "yes" : "no", amount: b.amount },
        meta: { icon: b.category.icon, variable: b.variable, active: b.active, lastPaid: b.payments[0]?.paidOn?.toISOString() ?? null },
      })),
    };
  },
};

export function warrantyState(until: Date | null, now = new Date()): "none" | "expired" | "ending" | "active" {
  if (!until) return "none";
  const days = (until.getTime() - now.getTime()) / 86400_000;
  return days < 0 ? "expired" : days <= 90 ? "ending" : "active";
}

export const possessionsDataset: Dataset<Workspace> = {
  id: "possessions",
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const where: { orgId: string; room?: string; category?: string } = { orgId: ws.org.id };
    if (params.get("room")) where.room = params.get("room")!;
    if (params.get("type")) where.category = params.get("type")!;
    let items = await db.possession.findMany({ where, orderBy: [{ warrantyUntil: "asc" }, { name: "asc" }] });
    const w = params.get("warranty");
    if (w) items = items.filter((i) => warrantyState(i.warrantyUntil) === w);
    const photos = await db.attachment.findMany({
      where: { orgId: ws.org.id, entityType: "possession", entityId: { in: items.map((i) => i.id) }, thumbPath: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { id: true, entityId: true },
    });
    return {
      title: t("things.title"),
      columns: [
        { key: "name", label: "things.colName", type: "text", width: 28 },
        { key: "category", label: "things.category", type: "text", width: 14 },
        { key: "room", label: "things.colRoom", type: "text", width: 14, hideOnMobile: true },
        { key: "brand", label: "things.colBrand", type: "text", width: 22, hideOnMobile: true },
        { key: "serial", label: "things.colSerial", type: "text", width: 16, hideOnMobile: true },
        { key: "purchased", label: "things.colPurchased", type: "date", width: 13, hideOnMobile: true },
        { key: "store", label: "things.colStore", type: "text", width: 18, hideOnMobile: true },
        { key: "warranty", label: "things.colWarranty", type: "date", width: 14 },
        { key: "price", label: "things.colPrice", type: "money", total: true, width: 14 },
      ],
      rows: items.map((i) => ({
        id: i.id,
        href: `things?item=${i.id}`,
        cells: {
          name: pick(locale, i.name, i.nameAr),
          category: t(`things.types.${i.category}` as never) || i.category,
          room: i.room,
          brand: [i.brand, i.model].filter(Boolean).join(" ") || null,
          serial: i.serial,
          purchased: i.purchasedOn?.toISOString() ?? null,
          store: i.store,
          warranty: i.warrantyUntil?.toISOString() ?? null,
          price: i.price,
        },
        meta: { state: warrantyState(i.warrantyUntil), photo: photos.find((p) => p.entityId === i.id)?.id ?? null, type: i.category },
      })),
    };
  },
};

export const summaryDataset: Dataset<Workspace> = {
  id: "summary",
  permissions: ["claims.viewAll"],
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const month = monthParam(ws, params);
    const [now, prev] = await Promise.all([getMonthBudget(ws.org.id, month), getMonthBudget(ws.org.id, addMonths(month, -1))]);
    const total = now.reduce((s, c) => s + c.spent, 0) || 1;
    const fmt = createFormatter({ locale, digits: "latn" });
    return {
      title: t("summary.title"),
      subtitle: fmt.monthName(monthStart(month)),
      columns: [
        { key: "category", label: "summary.colCategory", type: "text", width: 26 },
        { key: "budget", label: "summary.colBudget", type: "money", total: true, width: 16 },
        { key: "spent", label: "summary.colSpent", type: "money", total: true, width: 16 },
        { key: "share", label: "summary.colShare", type: "percent", width: 11 },
        { key: "last", label: "summary.colLast", type: "money", total: true, width: 16 },
      ],
      rows: now
        .filter((c) => c.spent || c.budget)
        .sort((a, b) => b.spent - a.spent)
        .map((c) => ({ id: c.id, cells: { category: pick(locale, c.name, c.nameAr), budget: c.budget, spent: c.spent, share: c.spent / total, last: prev.find((p) => p.id === c.id)?.spent ?? 0 } })),
    };
  },
};
