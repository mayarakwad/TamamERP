"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getWorkspace, type Workspace } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { parseMoney } from "@/lib/money";
import { addMonths } from "@/lib/format";
import { indexBill, indexPossession, removeFromIndex } from "@/lib/search/index-core";
import { deleteAttachmentFiles } from "@/lib/attachments";
import type { ActionResult } from "./claims";

const qar = (d: number) => `QAR ${(d / 100).toLocaleString("en", { maximumFractionDigits: 2 })}`;
const dohaDate = (ymd: string) => new Date(`${ymd}T12:00:00+03:00`);

async function homeWorkspace(slug: string) {
  const ws = await getWorkspace(slug);
  if (ws.orgType !== "home") throw new Error("Not a home workspace");
  return ws;
}

function deny(): ActionResult {
  return { ok: false, error: "empty.notAllowed" };
}

// ───────────────────────── Budgets ─────────────────────────

export async function setBudget(slug: string, categoryId: string, month: string, amountText: string): Promise<ActionResult> {
  const ws = await homeWorkspace(slug);
  if (!ws.can("budgets.manage")) return deny();
  if (month !== "default" && !/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: "errors.generic" };
  const amount = amountText.trim() === "" ? 0 : parseMoney(amountText);
  if (amount === null || amount < 0) return { ok: false, error: "claims.amountInvalid" };
  const cat = await db.expenseCategory.findFirst({ where: { id: categoryId, orgId: ws.org.id } });
  if (!cat) return { ok: false, error: "empty.notFound" };
  await db.budget.upsert({
    where: { orgId_categoryId_month: { orgId: ws.org.id, categoryId, month } },
    create: { orgId: ws.org.id, categoryId, month, amount },
    update: { amount },
  });
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "budget.set", entityType: "category", entityId: categoryId, summary: `set ${cat.name} budget to ${qar(amount)} (${month === "default" ? "every month" : month})`, summaryAr: `تعديل ميزانية ${cat.nameAr}` });
  refresh();
  return { ok: true };
}

/** Copy every category's effective budget from one month into another. */
export async function copyBudgets(slug: string, from: string, to: string): Promise<ActionResult> {
  const ws = await homeWorkspace(slug);
  if (!ws.can("budgets.manage")) return deny();
  const budgets = await db.budget.findMany({ where: { orgId: ws.org.id, month: { in: [from, "default"] } } });
  const cats = [...new Set(budgets.map((b) => b.categoryId))];
  for (const categoryId of cats) {
    const amount = (budgets.find((b) => b.categoryId === categoryId && b.month === from) ?? budgets.find((b) => b.categoryId === categoryId && b.month === "default"))!.amount;
    await db.budget.upsert({ where: { orgId_categoryId_month: { orgId: ws.org.id, categoryId, month: to } }, create: { orgId: ws.org.id, categoryId, month: to, amount }, update: { amount } });
  }
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "budget.copied", summary: `copied budgets from ${from} to ${to}`, summaryAr: `نسخ الميزانيات من ${from} إلى ${to}` });
  refresh();
  return { ok: true };
}

const categoryInput = z.object({
  name: z.string().trim().min(1).max(40),
  nameAr: z.string().trim().max(40),
  icon: z.string().max(30),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  budget: z.string().max(20),
});

export async function createCategory(slug: string, raw: z.input<typeof categoryInput>): Promise<ActionResult> {
  const ws = await homeWorkspace(slug);
  if (!ws.can("budgets.manage")) return deny();
  const p = categoryInput.safeParse(raw);
  if (!p.success) return { ok: false, error: "errors.required", field: "name" };
  const key = p.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `c${Date.now().toString(36)}`;
  const exists = await db.expenseCategory.findFirst({ where: { orgId: ws.org.id, key } });
  const count = await db.expenseCategory.count({ where: { orgId: ws.org.id } });
  const cat = await db.expenseCategory.create({
    data: { orgId: ws.org.id, key: exists ? `${key}-${count}` : key, name: p.data.name, nameAr: p.data.nameAr || p.data.name, icon: p.data.icon, color: p.data.color, sort: count },
  });
  const amount = parseMoney(p.data.budget || "0") ?? 0;
  if (amount > 0) await db.budget.create({ data: { orgId: ws.org.id, categoryId: cat.id, month: "default", amount } });
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "category.created", entityType: "category", entityId: cat.id, summary: `added the category ${cat.name}`, summaryAr: `إضافة فئة ${cat.nameAr}` });
  refresh();
  return { ok: true };
}

// ───────────────────────── Bills ─────────────────────────

const billInput = z.object({
  name: z.string().trim().min(1).max(80),
  nameAr: z.string().trim().max(80),
  provider: z.string().trim().max(80),
  categoryId: z.string().min(1),
  amount: z.string().max(20),
  variable: z.boolean(),
  frequency: z.enum(["monthly", "quarterly", "yearly"]),
  nextDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  remindDaysBefore: z.number().int().min(0).max(60),
  autopay: z.boolean(),
  notes: z.string().trim().max(500),
});
export type BillInput = z.input<typeof billInput>;

async function parseBill(ws: Workspace, raw: BillInput) {
  const p = billInput.safeParse(raw);
  if (!p.success) return { error: "errors.required", field: String(p.error.issues[0]?.path[0] ?? "") };
  const amount = parseMoney(p.data.amount);
  if (!amount || amount <= 0) return { error: "claims.amountInvalid", field: "amount" };
  if (!(await db.expenseCategory.findFirst({ where: { id: p.data.categoryId, orgId: ws.org.id } }))) return { error: "errors.required", field: "categoryId" };
  return { data: { ...p.data, amount, nextDue: dohaDate(p.data.nextDue) } };
}

export async function saveBill(slug: string, id: string | null, raw: BillInput): Promise<ActionResult> {
  const ws = await homeWorkspace(slug);
  if (!ws.can("bills.manage")) return deny();
  const v = await parseBill(ws, raw);
  if ("error" in v) return { ok: false, error: v.error!, field: v.field };
  const d = v.data;
  const data = {
    name: d.name,
    nameAr: d.nameAr || null,
    provider: d.provider || null,
    categoryId: d.categoryId,
    amount: d.amount,
    variable: d.variable,
    frequency: d.frequency,
    nextDue: d.nextDue,
    remindDaysBefore: d.remindDaysBefore,
    autopay: d.autopay,
    notes: d.notes || null,
  };
  let billId = id;
  if (id) {
    const existing = await db.recurringBill.findFirst({ where: { id, orgId: ws.org.id } });
    if (!existing) return { ok: false, error: "empty.notFound" };
    await db.recurringBill.update({ where: { id }, data });
    // Keep the open payment in step with the bill.
    await db.billPayment.updateMany({ where: { billId: id, status: "due" }, data: { dueOn: d.nextDue, amount: d.amount, remindedAt: null } });
  } else {
    const bill = await db.recurringBill.create({ data: { ...data, orgId: ws.org.id } });
    await db.billPayment.create({ data: { orgId: ws.org.id, billId: bill.id, dueOn: d.nextDue, amount: d.amount, status: "due" } });
    billId = bill.id;
  }
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: id ? "bill.updated" : "bill.created", entityType: "bill", entityId: billId!, summary: `${id ? "updated" : "added"} the bill ${d.name} (${qar(d.amount)}, ${d.frequency})`, summaryAr: `${id ? "تعديل" : "إضافة"} فاتورة ${d.nameAr || d.name}` });
  await indexBill(db, billId!);
  refresh();
  return { ok: true };
}

function advance(due: Date, frequency: string): Date {
  const d = new Date(due);
  const months = frequency === "yearly" ? 12 : frequency === "quarterly" ? 3 : 1;
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/** Mark the open payment paid (or skipped) and schedule the next one. */
async function settle(slug: string, paymentId: string, mode: "paid" | "skipped", amountText?: string, paidOnYmd?: string): Promise<ActionResult<{ nextDue: string; name: string }>> {
  const ws = await homeWorkspace(slug);
  if (!ws.can("bills.manage")) return deny() as ActionResult<{ nextDue: string; name: string }>;
  const p = await db.billPayment.findFirst({ where: { id: paymentId, orgId: ws.org.id, status: "due" }, include: { bill: true } });
  if (!p) return { ok: false, error: "empty.notFound" };
  const amount = mode === "paid" ? (amountText ? parseMoney(amountText) : p.amount) : p.amount;
  if (mode === "paid" && (!amount || amount <= 0)) return { ok: false, error: "claims.amountInvalid", field: "amount" };
  const nextDue = advance(p.dueOn, p.bill.frequency);
  await db.$transaction([
    db.billPayment.update({ where: { id: p.id }, data: { status: mode, amount: amount!, paidOn: mode === "paid" ? (paidOnYmd ? dohaDate(paidOnYmd) : new Date()) : null, paidById: ws.viewer.id } }),
    db.billPayment.create({ data: { orgId: ws.org.id, billId: p.billId, dueOn: nextDue, amount: p.bill.amount, status: "due" } }),
    db.recurringBill.update({ where: { id: p.billId }, data: { nextDue } }),
  ]);
  await audit({
    orgId: ws.org.id,
    userId: ws.viewer.id,
    action: `bill.${mode}`,
    entityType: "bill",
    entityId: p.billId,
    summary: mode === "paid" ? `paid ${p.bill.name} (${qar(amount!)})` : `skipped ${p.bill.name}`,
    summaryAr: mode === "paid" ? `دفع ${p.bill.nameAr ?? p.bill.name}` : `تجاوز ${p.bill.nameAr ?? p.bill.name}`,
  });
  refresh();
  return { ok: true, nextDue: nextDue.toISOString(), name: p.bill.name };
}

export async function payBill(slug: string, paymentId: string, amount: string, paidOn: string) {
  return settle(slug, paymentId, "paid", amount, paidOn);
}
export async function skipBill(slug: string, paymentId: string) {
  return settle(slug, paymentId, "skipped");
}

export async function toggleBill(slug: string, id: string, active: boolean): Promise<ActionResult> {
  const ws = await homeWorkspace(slug);
  if (!ws.can("bills.manage")) return deny();
  const b = await db.recurringBill.findFirst({ where: { id, orgId: ws.org.id } });
  if (!b) return { ok: false, error: "empty.notFound" };
  await db.recurringBill.update({ where: { id }, data: { active } });
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: active ? "bill.resumed" : "bill.paused", entityType: "bill", entityId: id, summary: `${active ? "resumed" : "paused"} ${b.name}`, summaryAr: `${active ? "استئناف" : "إيقاف"} ${b.nameAr ?? b.name}` });
  refresh();
  return { ok: true };
}

export async function deleteBill(slug: string, id: string): Promise<ActionResult> {
  const ws = await homeWorkspace(slug);
  if (!ws.can("bills.manage")) return deny();
  const b = await db.recurringBill.findFirst({ where: { id, orgId: ws.org.id } });
  if (!b) return { ok: false, error: "empty.notFound" };
  await db.recurringBill.delete({ where: { id } });
  await removeFromIndex(db, "bill", id);
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "bill.deleted", entityType: "bill", entityId: id, summary: `deleted the bill ${b.name}`, summaryAr: `حذف فاتورة ${b.nameAr ?? b.name}`, sensitive: true });
  refresh();
  return { ok: true };
}

// ───────────────────────── Things we own ─────────────────────────

const possessionInput = z.object({
  name: z.string().trim().min(1).max(120),
  nameAr: z.string().trim().max(120),
  category: z.enum(["Electronics", "Appliances", "Furniture", "Vehicle", "Jewellery", "Other"]),
  room: z.string().trim().max(60),
  brand: z.string().trim().max(60),
  model: z.string().trim().max(60),
  serial: z.string().trim().max(80),
  purchasedOn: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  price: z.string().max(20),
  store: z.string().trim().max(80),
  warrantyUntil: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
  notes: z.string().trim().max(1000),
});
export type PossessionInput = z.input<typeof possessionInput>;

export async function savePossession(slug: string, id: string | null, raw: PossessionInput): Promise<ActionResult<{ id: string }>> {
  const ws = await homeWorkspace(slug);
  if (!ws.can("possessions.manage")) return deny() as ActionResult<{ id: string }>;
  const p = possessionInput.safeParse(raw);
  if (!p.success) return { ok: false, error: "errors.required", field: String(p.error.issues[0]?.path[0] ?? "") };
  const price = p.data.price.trim() ? parseMoney(p.data.price) : null;
  if (p.data.price.trim() && price === null) return { ok: false, error: "claims.amountInvalid", field: "price" };
  const data = {
    name: p.data.name,
    nameAr: p.data.nameAr || null,
    category: p.data.category,
    room: p.data.room || null,
    brand: p.data.brand || null,
    model: p.data.model || null,
    serial: p.data.serial || null,
    purchasedOn: p.data.purchasedOn ? dohaDate(p.data.purchasedOn) : null,
    price,
    store: p.data.store || null,
    warrantyUntil: p.data.warrantyUntil ? dohaDate(p.data.warrantyUntil) : null,
    warrantyRemindedAt: null,
    notes: p.data.notes || null,
  };
  let itemId = id;
  if (id) {
    if (!(await db.possession.findFirst({ where: { id, orgId: ws.org.id } }))) return { ok: false, error: "empty.notFound" };
    await db.possession.update({ where: { id }, data });
  } else {
    itemId = (await db.possession.create({ data: { ...data, orgId: ws.org.id } })).id;
  }
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: id ? "possession.updated" : "possession.created", entityType: "possession", entityId: itemId!, summary: `${id ? "updated" : "added"} ${data.name}`, summaryAr: `${id ? "تعديل" : "إضافة"} ${data.nameAr ?? data.name}` });
  await indexPossession(db, itemId!);
  refresh();
  return { ok: true, id: itemId! };
}

export async function deletePossession(slug: string, id: string): Promise<ActionResult> {
  const ws = await homeWorkspace(slug);
  if (!ws.can("possessions.manage")) return deny();
  const item = await db.possession.findFirst({ where: { id, orgId: ws.org.id } });
  if (!item) return { ok: false, error: "empty.notFound" };
  const files = await db.attachment.findMany({ where: { orgId: ws.org.id, entityType: "possession", entityId: id } });
  for (const f of files) await deleteAttachmentFiles(f);
  await db.attachment.deleteMany({ where: { orgId: ws.org.id, entityType: "possession", entityId: id } });
  await db.possession.delete({ where: { id } });
  await removeFromIndex(db, "possession", id);
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "possession.deleted", entityType: "possession", entityId: id, summary: `deleted ${item.name}`, summaryAr: `حذف ${item.nameAr ?? item.name}` });
  refresh();
  return { ok: true };
}

export async function previousMonth(month: string) {
  return addMonths(month, -1);
}
