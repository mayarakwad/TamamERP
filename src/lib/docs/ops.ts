// What happens when a sales or purchase document changes state, including the
// journal entries and stock movements. Server actions call these inside a
// transaction; the demo seed builds its history with the same functions, so
// the demo books always balance. No server-only imports.

import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { nextNumber } from "../series";
import { postEntry, reverseSource, type PostLine } from "../ledger/post";
import { moveStock } from "../inventory/stock";
import { docTotals, lineParts, stockValue } from "./math";

type Db = PrismaClient | Prisma.TransactionClient;

export type DocKind = "quote" | "invoice" | "po" | "bill" | "fee";

export const DOC_PREFIX: Record<DocKind, string> = { quote: "QUO", invoice: "INV", po: "PO", bill: "BILL", fee: "FEE" };

export const DOC_STATUSES: Record<DocKind, string[]> = {
  quote: ["draft", "sent", "accepted", "declined", "converted"],
  invoice: ["draft", "issued", "partial", "paid", "void"],
  po: ["draft", "sent", "partial", "received", "billed", "cancelled"],
  bill: ["draft", "posted", "partial", "paid", "void"],
  fee: ["draft", "issued", "partial", "paid", "void"],
};

export const isSalesKind = (k: string) => k === "quote" || k === "invoice";

export class DocError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export interface LineData {
  itemId?: string | null;
  description: string;
  qty: number;
  unitPrice: number;
  discountPct?: number;
  accountId?: string | null;
}

export interface SaveDocInput {
  orgId: string;
  kind: DocKind;
  id?: string | null;
  partyId: string;
  campusId?: string | null;
  date: Date;
  dueDate?: Date | null;
  reference?: string | null;
  notes?: string | null;
  terms?: string | null;
  lines: LineData[];
  sourceId?: string | null;
  createdById: string;
}

const DAY = 86400_000;

/** Create a draft, or replace the contents of an existing draft. */
export async function saveDocument(db: Db, d: SaveDocInput) {
  if (!d.lines.length) throw new DocError("docs.noLines");
  const party = await db.party.findFirst({ where: { id: d.partyId, orgId: d.orgId } });
  if (!party) throw new DocError("docs.partyRequired");
  const totals = docTotals(d.lines);
  const dueDate = d.dueDate ?? (d.kind === "quote" ? new Date(d.date.getTime() + 15 * DAY) : d.kind === "po" ? null : new Date(d.date.getTime() + party.paymentTerms * DAY));
  const lines = d.lines.map((l, i) => ({
    orgId: d.orgId,
    sort: i,
    itemId: l.itemId || null,
    description: l.description,
    qty: l.qty,
    unitPrice: l.unitPrice,
    discountPct: l.discountPct ?? 0,
    amount: lineParts(l).amount,
    accountId: l.accountId || null,
  }));
  const fields = {
    partyId: d.partyId,
    campusId: d.campusId ?? null,
    date: d.date,
    dueDate,
    reference: d.reference || null,
    notes: d.notes || null,
    terms: d.terms || null,
    subtotal: totals.subtotal,
    discount: totals.discount,
    total: totals.total,
  };
  if (d.id) {
    const existing = await db.document.findFirst({ where: { id: d.id, orgId: d.orgId } });
    if (!existing) throw new DocError("empty.notFound");
    if (existing.status !== "draft" && !(existing.kind === "quote" && existing.status === "sent") && !(existing.kind === "po" && existing.status === "sent")) throw new DocError("docs.notEditable");
    await db.documentLine.deleteMany({ where: { documentId: d.id } });
    return db.document.update({ where: { id: d.id }, data: { ...fields, lines: { create: lines } } });
  }
  const number = await nextNumber(db, d.orgId, DOC_PREFIX[d.kind], d.date);
  return db.document.create({
    data: { ...fields, orgId: d.orgId, kind: d.kind, number, status: "draft", sourceId: d.sourceId ?? null, createdById: d.createdById, lines: { create: lines } },
  });
}

async function loadDoc(db: Db, orgId: string, id: string, kind?: DocKind) {
  const doc = await db.document.findFirst({ where: { id, orgId, ...(kind ? { kind } : {}) }, include: { lines: { orderBy: { sort: "asc" }, include: { item: true } }, party: true } });
  if (!doc) throw new DocError("empty.notFound");
  return doc;
}

async function defaultCampus(db: Db, orgId: string, campusId: string | null) {
  if (campusId) return campusId;
  const c = await db.campus.findFirst({ where: { orgId }, orderBy: { createdAt: "asc" } });
  if (!c) throw new DocError("docs.noWarehouse");
  return c.id;
}

// ───────── Sales ─────────

/** Issue an invoice: receivable, income, and (for products) cost of sales + stock out. */
export async function issueInvoice(db: Db, orgId: string, id: string, userId: string, at = new Date()) {
  const doc = await loadDoc(db, orgId, id, "invoice");
  if (doc.status !== "draft") throw new DocError("docs.notDraft");
  const campusId = await defaultCampus(db, orgId, doc.campusId);
  const lines: PostLine[] = [{ role: "receivable", debit: doc.total, partyId: doc.partyId }];
  for (const l of doc.lines) {
    const product = l.item?.kind === "product";
    lines.push({ role: product ? "sales" : "services", credit: l.amount });
    if (product && l.itemId) {
      const { value } = await moveStock(db, { orgId, itemId: l.itemId, campusId, qty: -l.qty, date: doc.date, kind: "sale", sourceType: "document", sourceId: doc.id, createdById: userId });
      lines.push({ role: "cogs", debit: -value }, { role: "inventory", credit: -value });
    }
  }
  await postEntry(db, { orgId, date: doc.date, memo: `${doc.number} · ${doc.party.name}`, sourceType: "invoice", sourceId: doc.id, createdById: userId, lines });
  return db.document.update({ where: { id }, data: { status: "issued", issuedAt: at, campusId } });
}

/** Issue a school fee invoice: receivable up, each line to its income account (tuition, transport …). */
export async function issueFee(db: Db, orgId: string, id: string, userId: string, at = new Date()) {
  const doc = await loadDoc(db, orgId, id, "fee");
  if (doc.status !== "draft") throw new DocError("docs.notDraft");
  const lines: PostLine[] = [{ role: "receivable", debit: doc.total, partyId: doc.partyId }];
  for (const l of doc.lines) lines.push(l.accountId ? { accountId: l.accountId, credit: l.amount } : { role: "tuition", credit: l.amount });
  await postEntry(db, { orgId, date: doc.date, memo: `${doc.number} · ${doc.party.name}`, sourceType: "fee", sourceId: doc.id, createdById: userId, lines });
  return db.document.update({ where: { id }, data: { status: "issued", issuedAt: at } });
}

/** Turn a quotation into a draft invoice with the same lines. */
export async function convertQuote(db: Db, orgId: string, id: string, userId: string, date = new Date(), invoiceTerms?: string | null) {
  const q = await loadDoc(db, orgId, id, "quote");
  if (q.status === "converted" || q.status === "declined") throw new DocError("docs.notConvertible");
  const inv = await saveDocument(db, {
    orgId,
    kind: "invoice",
    partyId: q.partyId,
    campusId: q.campusId,
    date,
    reference: q.reference,
    notes: q.notes,
    terms: invoiceTerms ?? null,
    sourceId: q.id,
    createdById: userId,
    lines: q.lines.map((l) => ({ itemId: l.itemId, description: l.description, qty: l.qty, unitPrice: l.unitPrice, discountPct: l.discountPct })),
  });
  await db.document.update({ where: { id: q.id }, data: { status: "converted" } });
  return inv;
}

// ───────── Purchases ─────────

/** Receive goods against a purchase order into a warehouse. Inventory up, "goods received not billed" up. */
export async function receivePO(db: Db, orgId: string, id: string, userId: string, input: { campusId: string; date: Date; lines: { lineId: string; qty: number }[] }) {
  const po = await loadDoc(db, orgId, id, "po");
  if (!["draft", "sent", "partial"].includes(po.status)) throw new DocError("docs.notReceivable");
  let value = 0;
  for (const r of input.lines) {
    if (r.qty <= 0) continue;
    const line = po.lines.find((l) => l.id === r.lineId);
    if (!line) continue;
    const remaining = line.qty - line.received;
    const qty = Math.min(r.qty, remaining);
    if (qty <= 0) continue;
    const unitCost = line.qty ? Math.round((line.amount * 100) / line.qty) : line.unitPrice;
    if (line.item?.kind === "product" && line.itemId) {
      const moved = await moveStock(db, { orgId, itemId: line.itemId, campusId: input.campusId, qty, unitCost, date: input.date, kind: "receipt", sourceType: "document", sourceId: po.id, createdById: userId });
      value += moved.value;
    }
    await db.documentLine.update({ where: { id: line.id }, data: { received: line.received + qty } });
  }
  if (value) {
    await postEntry(db, { orgId, date: input.date, memo: `Goods received · ${po.number} · ${po.party.name}`, sourceType: "receipt", sourceId: po.id, createdById: userId, lines: [{ role: "inventory", debit: value }, { role: "grni", credit: value }] });
  }
  const after = await db.documentLine.findMany({ where: { documentId: po.id } });
  const done = after.every((l) => l.received >= l.qty);
  const any = after.some((l) => l.received > 0);
  return db.document.update({ where: { id: po.id }, data: { status: done ? "received" : any ? "partial" : po.status, campusId: input.campusId } });
}

/** Draft a supplier bill for what has been received on a purchase order, at the order's prices. */
export async function billFromPO(db: Db, orgId: string, id: string, userId: string, date = new Date(), supplierRef?: string | null) {
  const po = await loadDoc(db, orgId, id, "po");
  if (!["partial", "received"].includes(po.status)) throw new DocError("docs.receiveFirst");
  const lines = po.lines
    .filter((l) => l.received > 0 || l.item?.kind !== "product")
    .map((l) => ({ itemId: l.itemId, description: l.description, qty: l.item?.kind === "product" ? l.received : l.qty, unitPrice: l.unitPrice, discountPct: l.discountPct, accountId: l.accountId }));
  const bill = await saveDocument(db, { orgId, kind: "bill", partyId: po.partyId, campusId: po.campusId, date, reference: supplierRef ?? null, sourceId: po.id, createdById: userId, lines });
  return bill;
}

/** Post a supplier bill: payable up; stock, GRNI or expenses on the other side. */
export async function postBill(db: Db, orgId: string, id: string, userId: string) {
  const bill = await loadDoc(db, orgId, id, "bill");
  if (bill.status !== "draft") throw new DocError("docs.notDraft");
  const fromPO = bill.sourceId ? await db.document.findFirst({ where: { id: bill.sourceId, orgId, kind: "po" } }) : null;
  const lines: PostLine[] = [{ role: "payable", credit: bill.total, partyId: bill.partyId }];
  let campusId: string | null = bill.campusId;
  for (const l of bill.lines) {
    const product = l.item?.kind === "product" && l.itemId;
    if (product && fromPO) {
      lines.push({ role: "grni", debit: l.amount });
    } else if (product) {
      campusId = await defaultCampus(db, orgId, campusId);
      const unitCost = l.qty ? Math.round((l.amount * 100) / l.qty) : l.unitPrice;
      await moveStock(db, { orgId, itemId: l.itemId!, campusId, qty: l.qty, unitCost, date: bill.date, kind: "receipt", sourceType: "document", sourceId: bill.id, createdById: userId });
      lines.push({ role: "inventory", debit: l.amount });
    } else if (l.accountId) {
      lines.push({ accountId: l.accountId, debit: l.amount });
    } else {
      lines.push({ role: "otherExpense", debit: l.amount });
    }
  }
  await postEntry(db, { orgId, date: bill.date, memo: `${bill.number} · ${bill.party.name}${bill.reference ? ` · ${bill.reference}` : ""}`, sourceType: "bill", sourceId: bill.id, createdById: userId, lines });
  if (fromPO) await db.document.update({ where: { id: fromPO.id }, data: { status: "billed" } });
  return db.document.update({ where: { id }, data: { status: "posted", issuedAt: new Date(), campusId } });
}

/** Void an issued invoice or posted bill that has no payments: reverse its entries and stock. */
export async function voidDocument(db: Db, orgId: string, id: string, userId: string, date = new Date()) {
  const doc = await loadDoc(db, orgId, id);
  if (!["invoice", "bill", "fee"].includes(doc.kind) || !["issued", "posted"].includes(doc.status)) throw new DocError("docs.notVoidable");
  if (doc.paid > 0) throw new DocError("docs.hasPayments");
  await reverseSource(db, { orgId, sourceType: doc.kind, sourceId: doc.id, date, createdById: userId, memo: `Void ${doc.number}` });
  const moves = await db.stockMove.findMany({ where: { orgId, sourceType: "document", sourceId: doc.id } });
  for (const m of moves) {
    await moveStock(db, { orgId, itemId: m.itemId, campusId: m.campusId, qty: -m.qty, unitCost: m.unitCost, date, kind: "adjustment", sourceType: "void", sourceId: doc.id, note: `Void ${doc.number}`, createdById: userId });
  }
  if (doc.kind === "bill" && doc.sourceId) await db.document.updateMany({ where: { id: doc.sourceId, orgId, status: "billed" }, data: { status: "received" } });
  return db.document.update({ where: { id }, data: { status: "void" } });
}

// ───────── Payments ─────────

export interface PaymentInput {
  orgId: string;
  direction: "in" | "out";
  partyId: string;
  date: Date;
  amount: number;
  method: string;
  accountId: string;
  reference?: string | null;
  notes?: string | null;
  allocations: { documentId: string; amount: number }[];
  createdById: string;
}

function statusAfterPayment(kind: string, total: number, paid: number) {
  if (paid >= total) return "paid";
  if (paid > 0) return "partial";
  return kind === "invoice" || kind === "fee" ? "issued" : "posted";
}

/** Money received from a customer or paid to a supplier, applied to open documents. */
export async function recordPayment(db: Db, p: PaymentInput) {
  if (p.amount <= 0) throw new DocError("claims.amountInvalid");
  const allocated = p.allocations.reduce((s, a) => s + a.amount, 0);
  if (allocated > p.amount) throw new DocError("docs.overAllocated");
  const account = await db.account.findFirst({ where: { id: p.accountId, orgId: p.orgId, role: { in: ["cash", "bank"] } } });
  const cashAccount = account ?? (await db.account.findFirst({ where: { id: p.accountId, orgId: p.orgId, type: "asset" } }));
  if (!cashAccount) throw new DocError("docs.accountRequired");
  const party = await db.party.findFirstOrThrow({ where: { id: p.partyId, orgId: p.orgId } });

  for (const a of p.allocations) {
    const d = await db.document.findFirst({ where: { id: a.documentId, orgId: p.orgId, partyId: p.partyId } });
    const kinds = p.direction === "in" ? ["invoice", "fee"] : ["bill"];
    if (!d || !kinds.includes(d.kind) || !["issued", "posted", "partial"].includes(d.status)) throw new DocError("docs.badAllocation");
    if (a.amount > d.total - d.paid) throw new DocError("docs.overAllocated");
  }

  const number = await nextNumber(db, p.orgId, p.direction === "in" ? "RCV" : "PAY", p.date);
  const payment = await db.payment.create({
    data: {
      orgId: p.orgId,
      number,
      direction: p.direction,
      partyId: p.partyId,
      date: p.date,
      amount: p.amount,
      method: p.method,
      accountId: cashAccount.id,
      reference: p.reference || null,
      notes: p.notes || null,
      createdById: p.createdById,
      allocations: { create: p.allocations.filter((a) => a.amount > 0).map((a) => ({ orgId: p.orgId, documentId: a.documentId, amount: a.amount })) },
    },
  });
  for (const a of p.allocations) {
    if (a.amount <= 0) continue;
    const d = await db.document.update({ where: { id: a.documentId }, data: { paid: { increment: a.amount } } });
    await db.document.update({ where: { id: d.id }, data: { status: statusAfterPayment(d.kind, d.total, d.paid) } });
  }
  const lines: PostLine[] =
    p.direction === "in"
      ? [{ accountId: cashAccount.id, debit: p.amount }, { role: "receivable", credit: p.amount, partyId: p.partyId }]
      : [{ role: "payable", debit: p.amount, partyId: p.partyId }, { accountId: cashAccount.id, credit: p.amount }];
  await postEntry(db, { orgId: p.orgId, date: p.date, memo: `${number} · ${party.name}${p.reference ? ` · ${p.reference}` : ""}`, sourceType: "payment", sourceId: payment.id, createdById: p.createdById, lines });
  return payment;
}

/** Cancel a payment: reverse its entry and reopen the documents it paid. */
export async function voidPayment(db: Db, orgId: string, id: string, userId: string, date = new Date()) {
  const pay = await db.payment.findFirst({ where: { id, orgId, voidedAt: null }, include: { allocations: true } });
  if (!pay) throw new DocError("empty.notFound");
  for (const a of pay.allocations) {
    const d = await db.document.update({ where: { id: a.documentId }, data: { paid: { decrement: a.amount } } });
    await db.document.update({ where: { id: d.id }, data: { status: statusAfterPayment(d.kind, d.total, d.paid) } });
  }
  await reverseSource(db, { orgId, sourceType: "payment", sourceId: pay.id, date, createdById: userId, memo: `Void ${pay.number}` });
  return db.payment.update({ where: { id }, data: { voidedAt: new Date() } });
}

// ───────── Stock adjustments ─────────

/** Set counted quantities; the difference goes to stock adjustments in the ledger. */
export async function adjustStock(db: Db, orgId: string, userId: string, input: { campusId: string; date: Date; note?: string | null; lines: { itemId: string; counted: number }[] }) {
  let total = 0;
  const ref = `ADJ-${input.date.toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`;
  for (const l of input.lines) {
    const level = await db.stockLevel.findUnique({ where: { itemId_campusId: { itemId: l.itemId, campusId: input.campusId } } });
    const diff = l.counted - (level?.qty ?? 0);
    if (!diff) continue;
    const { value } = await moveStock(db, { orgId, itemId: l.itemId, campusId: input.campusId, qty: diff, date: input.date, kind: "adjustment", sourceType: "adjustment", sourceId: ref, note: input.note ?? null, createdById: userId });
    total += value;
  }
  if (total) {
    await postEntry(db, {
      orgId,
      date: input.date,
      memo: input.note || "Stock count adjustment",
      sourceType: "stock",
      sourceId: ref,
      createdById: userId,
      lines: total > 0 ? [{ role: "inventory", debit: total }, { role: "stockAdjust", credit: total }] : [{ role: "stockAdjust", debit: -total }, { role: "inventory", credit: -total }],
    });
  }
  return total;
}

/** Move stock between warehouses (no ledger effect: same company, same value). */
export async function transferStock(db: Db, orgId: string, userId: string, input: { from: string; to: string; date: Date; note?: string | null; lines: { itemId: string; qty: number }[] }) {
  if (input.from === input.to) throw new DocError("inventory.sameWarehouse");
  const ref = `TRF-${Date.now().toString(36)}`;
  for (const l of input.lines) {
    if (l.qty <= 0) continue;
    const { unitCost } = await moveStock(db, { orgId, itemId: l.itemId, campusId: input.from, qty: -l.qty, date: input.date, kind: "transfer", sourceType: "transfer", sourceId: ref, note: input.note ?? null, createdById: userId, quiet: true });
    await moveStock(db, { orgId, itemId: l.itemId, campusId: input.to, qty: l.qty, unitCost, date: input.date, kind: "transfer", sourceType: "transfer", sourceId: ref, note: input.note ?? null, createdById: userId, quiet: true });
  }
  return ref;
}

export { stockValue };
