"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getWorkspace, type Workspace } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { parseMoney } from "@/lib/money";
import { parseQty } from "@/lib/docs/math";
import { indexDocument, indexItem, indexParty, removeFromIndex } from "@/lib/search/index-core";
import {
  adjustStock,
  billFromPO,
  convertQuote,
  DocError,
  issueInvoice,
  postBill,
  receivePO,
  recordPayment,
  saveDocument,
  transferStock,
  voidDocument,
  voidPayment,
  type DocKind,
} from "@/lib/docs/ops";
import type { Permission } from "@/lib/rbac";
import { bizSettings } from "@/lib/biz";
import type { ActionResult } from "./claims";

const dohaNoon = (ymd: string) => new Date(`${ymd}T12:00:00+03:00`);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const qar = (d: number) => `QAR ${(d / 100).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function bizWs(slug: string, ...perms: Permission[]) {
  const ws = await getWorkspace(slug);
  if (ws.orgType !== "business" || (perms.length && !perms.some((p) => ws.can(p)))) throw new DocError("empty.notAllowed");
  return ws;
}

/** Run an action; DocErrors become friendly results instead of crashes. */
async function attempt<R extends ActionResult<object>>(fn: () => Promise<R>): Promise<R | { ok: false; error: string }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DocError) return { ok: false, error: e.code };
    throw e;
  }
}

const log = (ws: Workspace, action: string, entityType: string, entityId: string, summary: string, summaryAr: string, extra: { sensitive?: boolean; meta?: Record<string, number | string> } = {}) =>
  audit({ orgId: ws.org.id, userId: ws.viewer.id, action, entityType, entityId, summary, summaryAr, ...extra });

// ───────────────────────── Customers & suppliers ─────────────────────────

const partyInput = z.object({
  name: z.string().trim().min(2).max(160),
  nameAr: z.string().trim().max(160).default(""),
  isCustomer: z.boolean(),
  isSupplier: z.boolean(),
  contactName: z.string().trim().max(120).default(""),
  phone: z.string().trim().max(40).default(""),
  email: z.union([z.email(), z.literal("")]).default(""),
  address: z.string().trim().max(300).default(""),
  addressAr: z.string().trim().max(300).default(""),
  crNumber: z.string().trim().max(40).default(""),
  paymentTerms: z.number().int().min(0).max(365),
  creditLimit: z.string().max(20).default(""),
  notes: z.string().trim().max(1000).default(""),
});
export type PartyInput = z.input<typeof partyInput>;

export async function saveParty(slug: string, id: string | null, raw: PartyInput): Promise<ActionResult<{ id: string }>> {
  return attempt(async () => {
    const ws = await bizWs(slug, "finance.manage");
    const parsed = partyInput.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "errors.required", field: String(parsed.error.issues[0]?.path[0] ?? "") };
    const d = parsed.data;
    if (!d.isCustomer && !d.isSupplier) return { ok: false, error: "parties.pickRole", field: "isCustomer" };
    const creditLimit = d.creditLimit ? parseMoney(d.creditLimit) : null;
    const data = {
      name: d.name,
      nameAr: d.nameAr || null,
      isCustomer: d.isCustomer,
      isSupplier: d.isSupplier,
      contactName: d.contactName || null,
      phone: d.phone || null,
      email: d.email || null,
      address: d.address || null,
      addressAr: d.addressAr || null,
      crNumber: d.crNumber || null,
      paymentTerms: d.paymentTerms,
      creditLimit,
      notes: d.notes || null,
    };
    let partyId = id;
    if (id) {
      const existing = await db.party.findFirst({ where: { id, orgId: ws.org.id } });
      if (!existing) return { ok: false, error: "empty.notFound" };
      await db.party.update({ where: { id }, data });
      await log(ws, "party.updated", "party", id, `updated ${d.name}`, `تعديل ${d.nameAr || d.name}`);
    } else {
      const p = await db.party.create({ data: { ...data, orgId: ws.org.id } });
      partyId = p.id;
      await log(ws, "party.created", "party", p.id, `added ${d.isCustomer ? "customer" : "supplier"} ${d.name}`, `إضافة ${d.isCustomer ? "عميل" : "مورد"}: ${d.nameAr || d.name}`);
    }
    await indexParty(db, partyId!);
    refresh();
    return { ok: true, id: partyId! };
  });
}

export async function archiveParty(slug: string, id: string, archived: boolean): Promise<ActionResult> {
  return attempt(async () => {
    const ws = await bizWs(slug, "finance.manage");
    const p = await db.party.findFirst({ where: { id, orgId: ws.org.id } });
    if (!p) return { ok: false, error: "empty.notFound" };
    await db.party.update({ where: { id }, data: { archived } });
    await indexParty(db, id);
    await log(ws, archived ? "party.archived" : "party.restored", "party", id, `${archived ? "archived" : "restored"} ${p.name}`, `${archived ? "أرشفة" : "استعادة"} ${p.nameAr ?? p.name}`);
    refresh();
    return { ok: true };
  });
}

// ───────────────────────── Items ─────────────────────────

const itemInput = z.object({
  sku: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(160),
  nameAr: z.string().trim().max(160).default(""),
  kind: z.enum(["product", "service"]),
  category: z.string().trim().max(60).default(""),
  unit: z.string().trim().min(1).max(20),
  salePrice: z.string().max(20),
  purchasePrice: z.string().max(20).default(""),
  reorderLevel: z.string().max(20).default(""),
  reorderQty: z.string().max(20).default(""),
  barcode: z.string().trim().max(60).default(""),
});
export type ItemInput = z.input<typeof itemInput>;

export async function saveItem(slug: string, id: string | null, raw: ItemInput): Promise<ActionResult<{ id: string }>> {
  return attempt(async () => {
    const ws = await bizWs(slug, "finance.manage", "inventory.manage");
    const parsed = itemInput.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "errors.required", field: String(parsed.error.issues[0]?.path[0] ?? "") };
    const d = parsed.data;
    const salePrice = parseMoney(d.salePrice || "0");
    if (salePrice === null || salePrice < 0) return { ok: false, error: "claims.amountInvalid", field: "salePrice" };
    const purchasePrice = d.purchasePrice ? parseMoney(d.purchasePrice) : 0;
    const reorderLevel = d.reorderLevel ? parseQty(d.reorderLevel) : null;
    const reorderQty = d.reorderQty ? parseQty(d.reorderQty) : null;
    const sku = d.sku.toUpperCase();
    const clash = await db.item.findFirst({ where: { orgId: ws.org.id, sku, ...(id ? { id: { not: id } } : {}) } });
    if (clash) return { ok: false, error: "items.skuTaken", field: "sku" };
    // Storekeepers may change stock settings but not prices.
    const priceFields = ws.can("finance.manage") ? { salePrice, purchasePrice: purchasePrice ?? 0 } : {};
    const data = { sku, name: d.name, nameAr: d.nameAr || null, kind: d.kind, category: d.category || null, unit: d.unit, reorderLevel, reorderQty, barcode: d.barcode || null, ...priceFields };
    let itemId = id;
    if (id) {
      if (!(await db.item.findFirst({ where: { id, orgId: ws.org.id } }))) return { ok: false, error: "empty.notFound" };
      await db.item.update({ where: { id }, data });
      await log(ws, "item.updated", "item", id, `updated item ${sku} · ${d.name}`, `تعديل الصنف ${sku}`);
    } else {
      const item = await db.item.create({ data: { ...data, salePrice, purchasePrice: purchasePrice ?? 0, avgCost: purchasePrice ?? 0, orgId: ws.org.id } });
      itemId = item.id;
      await log(ws, "item.created", "item", item.id, `added item ${sku} · ${d.name}`, `إضافة الصنف ${sku}`);
    }
    await indexItem(db, itemId!);
    refresh();
    return { ok: true, id: itemId! };
  });
}

export async function archiveItem(slug: string, id: string, archived: boolean): Promise<ActionResult> {
  return attempt(async () => {
    const ws = await bizWs(slug, "finance.manage", "inventory.manage");
    const item = await db.item.findFirst({ where: { id, orgId: ws.org.id } });
    if (!item) return { ok: false, error: "empty.notFound" };
    await db.item.update({ where: { id }, data: { archived } });
    await indexItem(db, id);
    await log(ws, archived ? "item.archived" : "item.restored", "item", id, `${archived ? "archived" : "restored"} ${item.sku}`, `${archived ? "أرشفة" : "استعادة"} ${item.sku}`);
    refresh();
    return { ok: true };
  });
}

// ───────────────────────── Documents ─────────────────────────

const lineInput = z.object({
  itemId: z.string().nullable().optional(),
  description: z.string().trim().min(1).max(500),
  qty: z.number().int().positive().max(100_000_000),
  unitPrice: z.number().int().min(0).max(10_000_000_000),
  discountPct: z.number().int().min(0).max(10000).default(0),
  accountId: z.string().nullable().optional(),
});

const docInput = z.object({
  partyId: z.string().min(1),
  campusId: z.string().nullable().optional(),
  date: ymd,
  dueDate: ymd.nullable().optional(),
  reference: z.string().trim().max(80).default(""),
  notes: z.string().trim().max(2000).default(""),
  terms: z.string().trim().max(2000).default(""),
  lines: z.array(lineInput).min(1).max(200),
});
export type DocInput = z.input<typeof docInput>;

const DOC_WORDS: Record<DocKind, [string, string]> = { quote: ["quotation", "عرض سعر"], invoice: ["invoice", "فاتورة"], po: ["purchase order", "أمر شراء"], bill: ["supplier bill", "فاتورة مورد"], fee: ["fee invoice", "فاتورة رسوم"] };

export async function saveDoc(slug: string, kind: DocKind, id: string | null, raw: DocInput): Promise<ActionResult<{ id: string; number: string }>> {
  return attempt(async () => {
    const ws = await bizWs(slug, "finance.manage");
    const parsed = docInput.safeParse(raw);
    if (!parsed.success) {
      const path = parsed.error.issues[0]?.path ?? [];
      return { ok: false, error: path[0] === "lines" ? "docs.lineInvalid" : path[0] === "partyId" ? "docs.partyRequired" : "errors.required", field: String(path[0] ?? "") };
    }
    const d = parsed.data;
    if (d.campusId && !ws.org.campuses.some((c) => c.id === d.campusId)) return { ok: false, error: "errors.generic" };
    const itemIds = d.lines.map((l) => l.itemId).filter(Boolean) as string[];
    if (itemIds.length && (await db.item.count({ where: { orgId: ws.org.id, id: { in: itemIds } } })) !== new Set(itemIds).size) return { ok: false, error: "docs.lineInvalid" };
    const doc = await db.$transaction((tx) =>
      saveDocument(tx, {
        orgId: ws.org.id,
        kind,
        id,
        partyId: d.partyId,
        campusId: d.campusId ?? null,
        date: dohaNoon(d.date),
        dueDate: d.dueDate ? dohaNoon(d.dueDate) : null,
        reference: d.reference,
        notes: d.notes,
        terms: d.terms,
        lines: d.lines,
        createdById: ws.viewer.id,
      }),
    );
    const w = DOC_WORDS[kind];
    await log(ws, id ? "document.updated" : "document.created", "document", doc.id, `${id ? "edited" : "created"} ${w[0]} ${doc.number} (${qar(doc.total)})`, `${id ? "تعديل" : "إنشاء"} ${w[1]} ${doc.number}`, { meta: { total: doc.total } });
    await indexDocument(db, doc.id);
    refresh();
    return { ok: true, id: doc.id, number: doc.number };
  });
}

export type DocAction = "send" | "accept" | "decline" | "issue" | "convert" | "post" | "void" | "cancel" | "delete" | "bill" | "reopen";

const ACTION_WORDS: Record<DocAction, [string, string]> = {
  send: ["marked as sent", "تحديد كمُرسل"],
  accept: ["marked as accepted", "تحديد كمقبول"],
  decline: ["marked as declined", "تحديد كمرفوض"],
  issue: ["issued", "إصدار"],
  convert: ["converted to an invoice", "تحويل إلى فاتورة"],
  post: ["posted", "ترحيل"],
  void: ["voided", "إلغاء"],
  cancel: ["cancelled", "إلغاء"],
  delete: ["deleted draft", "حذف مسودة"],
  bill: ["created a bill from", "إنشاء فاتورة مورد من"],
  reopen: ["reopened", "إعادة فتح"],
};

/** Every state change on a document, checked against what's allowed for its kind and status. */
export async function docAction(slug: string, id: string, action: DocAction, extra?: { date?: string; reference?: string }): Promise<ActionResult<{ id?: string; number?: string }>> {
  return attempt(async () => {
    const ws = await bizWs(slug, "finance.manage");
    const doc = await db.document.findFirst({ where: { id, orgId: ws.org.id } });
    if (!doc) return { ok: false, error: "empty.notFound" };
    const k = doc.kind as DocKind;
    const s = doc.status;
    const date = extra?.date ? dohaNoon(extra.date) : new Date();
    const allowed: Record<DocAction, boolean> = {
      send: (k === "quote" || k === "po") && s === "draft",
      accept: k === "quote" && (s === "draft" || s === "sent"),
      decline: k === "quote" && (s === "draft" || s === "sent"),
      reopen: k === "quote" && s === "declined",
      issue: k === "invoice" && s === "draft",
      convert: k === "quote" && ["draft", "sent", "accepted"].includes(s),
      post: k === "bill" && s === "draft",
      void: (k === "invoice" && s === "issued") || (k === "bill" && s === "posted"),
      cancel: k === "po" && ["draft", "sent"].includes(s),
      delete: s === "draft" || (k === "quote" && ["sent", "declined"].includes(s)),
      bill: k === "po" && ["partial", "received"].includes(s),
    };
    if (!allowed[action]) return { ok: false, error: "docs.notAllowedNow" };

    let created: { id: string; number: string } | undefined;
    await db.$transaction(async (tx) => {
      switch (action) {
        case "send":
          await tx.document.update({ where: { id }, data: { status: "sent" } });
          break;
        case "accept":
          await tx.document.update({ where: { id }, data: { status: "accepted" } });
          break;
        case "decline":
          await tx.document.update({ where: { id }, data: { status: "declined" } });
          break;
        case "reopen":
          await tx.document.update({ where: { id }, data: { status: "sent" } });
          break;
        case "cancel":
          await tx.document.update({ where: { id }, data: { status: "cancelled" } });
          break;
        case "issue":
          await issueInvoice(tx, ws.org.id, id, ws.viewer.id);
          break;
        case "post":
          await postBill(tx, ws.org.id, id, ws.viewer.id);
          break;
        case "void":
          await voidDocument(tx, ws.org.id, id, ws.viewer.id, date);
          break;
        case "convert": {
          const inv = await convertQuote(tx, ws.org.id, id, ws.viewer.id, new Date(), bizSettings(ws.org).sales?.invoiceTerms);
          created = { id: inv.id, number: inv.number };
          break;
        }
        case "bill": {
          const bill = await billFromPO(tx, ws.org.id, id, ws.viewer.id, date, extra?.reference);
          created = { id: bill.id, number: bill.number };
          break;
        }
        case "delete":
          await tx.document.delete({ where: { id } });
          break;
      }
    });
    const w = ACTION_WORDS[action];
    await log(ws, `document.${action}`, "document", id, `${w[0]} ${doc.number}${created ? ` → ${created.number}` : ""}`, `${w[1]} ${doc.number}`, { sensitive: action === "void" || action === "delete", meta: { total: doc.total } });
    if (action === "delete") await removeFromIndex(db, "document", id);
    else await indexDocument(db, id);
    if (created) await indexDocument(db, created.id);
    refresh();
    return { ok: true, ...created };
  });
}

const receiveInput = z.object({
  campusId: z.string().min(1),
  date: ymd,
  lines: z.array(z.object({ lineId: z.string(), qty: z.number().int().min(0) })).min(1),
});

export async function receiveGoods(slug: string, id: string, raw: z.input<typeof receiveInput>): Promise<ActionResult> {
  return attempt(async () => {
    const ws = await bizWs(slug, "inventory.manage");
    const parsed = receiveInput.safeParse(raw);
    if (!parsed.success || !ws.org.campuses.some((c) => c.id === parsed.data.campusId)) return { ok: false, error: "errors.generic" };
    const po = await db.$transaction((tx) => receivePO(tx, ws.org.id, id, ws.viewer.id, { campusId: parsed.data.campusId, date: dohaNoon(parsed.data.date), lines: parsed.data.lines }));
    const units = parsed.data.lines.reduce((s, l) => s + l.qty, 0) / 100;
    await log(ws, "document.received", "document", id, `received ${units} units on ${po.number}`, `استلام بضاعة على ${po.number}`);
    await indexDocument(db, id);
    refresh();
    return { ok: true };
  });
}

// ───────────────────────── Payments ─────────────────────────

const paymentInput = z.object({
  direction: z.enum(["in", "out"]),
  partyId: z.string().min(1),
  date: ymd,
  amount: z.string().max(20),
  method: z.enum(["cash", "transfer", "cheque", "card"]),
  accountId: z.string().min(1),
  reference: z.string().trim().max(80).default(""),
  notes: z.string().trim().max(500).default(""),
  allocations: z.array(z.object({ documentId: z.string(), amount: z.number().int().min(0) })).max(100),
});
export type PaymentFormInput = z.input<typeof paymentInput>;

export async function savePayment(slug: string, raw: PaymentFormInput): Promise<ActionResult<{ id: string; number: string }>> {
  return attempt(async () => {
    const ws = await bizWs(slug, "finance.manage");
    const parsed = paymentInput.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "errors.required", field: String(parsed.error.issues[0]?.path[0] ?? "") };
    const d = parsed.data;
    const amount = parseMoney(d.amount);
    if (!amount || amount <= 0) return { ok: false, error: "claims.amountInvalid", field: "amount" };
    const pay = await db.$transaction((tx) =>
      recordPayment(tx, { orgId: ws.org.id, direction: d.direction, partyId: d.partyId, date: dohaNoon(d.date), amount, method: d.method, accountId: d.accountId, reference: d.reference, notes: d.notes, allocations: d.allocations.filter((a) => a.amount > 0), createdById: ws.viewer.id }),
    );
    const party = await db.party.findUniqueOrThrow({ where: { id: d.partyId } });
    await log(
      ws,
      "payment.recorded",
      "payment",
      pay.id,
      `${d.direction === "in" ? "received" : "paid"} ${qar(amount)} ${d.direction === "in" ? "from" : "to"} ${party.name} (${pay.number})`,
      `${d.direction === "in" ? "استلام" : "دفع"} ${qar(amount)} · ${party.nameAr ?? party.name}`,
      { meta: { amount } },
    );
    for (const a of d.allocations) if (a.amount > 0) await indexDocument(db, a.documentId);
    refresh();
    return { ok: true, id: pay.id, number: pay.number };
  });
}

export async function cancelPayment(slug: string, id: string): Promise<ActionResult> {
  return attempt(async () => {
    const ws = await bizWs(slug, "finance.manage");
    const pay = await db.$transaction((tx) => voidPayment(tx, ws.org.id, id, ws.viewer.id));
    await log(ws, "payment.voided", "payment", id, `voided payment ${pay.number}`, `إلغاء الدفعة ${pay.number}`, { sensitive: true });
    refresh();
    return { ok: true };
  });
}

// ───────────────────────── Stock ─────────────────────────

const adjustInput = z.object({
  campusId: z.string().min(1),
  date: ymd,
  note: z.string().trim().max(300).default(""),
  lines: z.array(z.object({ itemId: z.string(), counted: z.number().int().min(0) })).min(1).max(500),
});

export async function saveStockCount(slug: string, raw: z.input<typeof adjustInput>): Promise<ActionResult<{ value: number }>> {
  return attempt(async () => {
    const ws = await bizWs(slug, "inventory.manage");
    const parsed = adjustInput.safeParse(raw);
    if (!parsed.success || !ws.org.campuses.some((c) => c.id === parsed.data.campusId)) return { ok: false, error: "errors.generic" };
    const value = await db.$transaction((tx) => adjustStock(tx, ws.org.id, ws.viewer.id, { ...parsed.data, date: dohaNoon(parsed.data.date) }));
    const campus = ws.org.campuses.find((c) => c.id === parsed.data.campusId)!;
    await log(ws, "stock.adjusted", "campus", campus.id, `counted stock at ${campus.name}: ${parsed.data.lines.length} items, difference ${qar(value)}`, `جرد المخزون في ${campus.nameAr ?? campus.name}`, { sensitive: true, meta: { value } });
    refresh();
    return { ok: true, value };
  });
}

const transferInput = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  date: ymd,
  note: z.string().trim().max(300).default(""),
  lines: z.array(z.object({ itemId: z.string(), qty: z.number().int().positive() })).min(1).max(500),
});

export async function saveTransfer(slug: string, raw: z.input<typeof transferInput>): Promise<ActionResult> {
  return attempt(async () => {
    const ws = await bizWs(slug, "inventory.manage");
    const parsed = transferInput.safeParse(raw);
    const c = ws.org.campuses;
    if (!parsed.success || !c.some((x) => x.id === parsed.data.from) || !c.some((x) => x.id === parsed.data.to)) return { ok: false, error: "errors.generic" };
    await db.$transaction((tx) => transferStock(tx, ws.org.id, ws.viewer.id, { ...parsed.data, date: dohaNoon(parsed.data.date) }));
    const from = c.find((x) => x.id === parsed.data.from)!;
    const to = c.find((x) => x.id === parsed.data.to)!;
    await log(ws, "stock.transferred", "campus", to.id, `moved ${parsed.data.lines.length} items from ${from.name} to ${to.name}`, `نقل أصناف من ${from.nameAr ?? from.name} إلى ${to.nameAr ?? to.name}`);
    refresh();
    return { ok: true };
  });
}

// ───────────────────────── Lookups for client sheets ─────────────────────────

/** What the payment sheet needs: cash/bank accounts, the party list, and the party's open documents. */
export async function paymentContext(slug: string, direction: "in" | "out", partyId?: string | null) {
  const ws = await bizWs(slug, "finance.manage");
  const kind = direction === "in" ? "invoice" : "bill";
  const [accounts, parties, docs] = await Promise.all([
    db.account.findMany({ where: { orgId: ws.org.id, role: { in: ["cash", "bank"] }, archived: false }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, nameAr: true, role: true } }),
    db.party.findMany({ where: { orgId: ws.org.id, archived: false, ...(direction === "in" ? { isCustomer: true } : { isSupplier: true }) }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true, phone: true } }),
    partyId
      ? db.document.findMany({ where: { orgId: ws.org.id, partyId, kind, status: { in: ["issued", "posted", "partial"] } }, orderBy: [{ dueDate: "asc" }, { date: "asc" }], select: { id: true, number: true, date: true, dueDate: true, total: true, paid: true, reference: true } })
      : Promise.resolve([]),
  ]);
  return {
    accounts,
    parties,
    docs: docs.map((d) => ({ id: d.id, number: d.number, date: d.date.toISOString(), dueDate: d.dueDate?.toISOString() ?? null, open: d.total - d.paid, reference: d.reference })),
  };
}
