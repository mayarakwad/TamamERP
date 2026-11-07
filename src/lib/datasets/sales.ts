import "server-only";
import { db } from "../db";
import type { Workspace } from "../auth/dal";
import { pick, type MessageKey } from "../i18n";
import type { Prisma } from "@/generated/prisma/client";
import type { Column, Dataset, DatasetResult } from "./types";
import { DOC_STATUSES, type DocKind } from "../docs/ops";

// Customers, suppliers, quotations, invoices, purchase orders, bills and payments.

export const DOC_PATH: Record<DocKind, string> = { quote: "sales/quotations", invoice: "sales/invoices", po: "purchases/orders", bill: "purchases/bills" };
export const DOC_TITLE: Record<DocKind, MessageKey> = { quote: "nav.quotations", invoice: "nav.invoices", po: "nav.purchaseOrders", bill: "nav.purchaseBills" };

const statusOptions = (kind: DocKind): Record<string, MessageKey> => Object.fromEntries([...DOC_STATUSES[kind], "overdue", "partReceived"].map((s) => [s, `status.${s}` as MessageKey]));

/** Shown status: open invoices and bills past their due date read "overdue". */
export function displayStatus(d: { kind: string; status: string; dueDate: Date | null }, now = new Date()) {
  if ((d.kind === "invoice" || d.kind === "bill") && ["issued", "posted", "partial"].includes(d.status) && d.dueDate && d.dueDate < now) return "overdue";
  if (d.kind === "po" && d.status === "partial") return "partReceived";
  return d.status;
}

export function docsWhere(ws: Workspace, kind: DocKind, params: URLSearchParams, now = new Date()): Prisma.DocumentWhereInput {
  const where: Prisma.DocumentWhereInput = { orgId: ws.org.id, kind };
  const status = params.get("status") === "partReceived" ? "partial" : params.get("status");
  if (status === "overdue") Object.assign(where, { status: { in: ["issued", "posted", "partial"] }, dueDate: { lt: now } });
  else if (status === "open") where.status = { in: kind === "invoice" ? ["issued", "partial"] : kind === "bill" ? ["posted", "partial"] : kind === "po" ? ["sent", "partial", "received"] : ["draft", "sent", "accepted"] };
  else if (status && DOC_STATUSES[kind].includes(status)) where.status = status;
  const party = params.get("party");
  if (party) where.partyId = party;
  const q = params.get("q")?.trim();
  if (q) where.OR = [{ number: { contains: q.toUpperCase() } }, { reference: { contains: q } }, { party: { name: { contains: q } } }, { party: { nameAr: { contains: q } } }];
  const from = params.get("from");
  const to = params.get("to");
  if (from || to) where.date = { ...(from ? { gte: new Date(`${from}T00:00:00+03:00`) } : {}), ...(to ? { lt: new Date(new Date(`${to}T00:00:00+03:00`).getTime() + 86400_000) } : {}) };
  return where;
}

function documentsDataset(id: string, kind: DocKind): Dataset<Workspace> {
  return {
    id,
    permissions: kind === "po" ? ["finance.view", "inventory.manage"] : ["finance.view"],
    async load(ws, params, { locale, t }): Promise<DatasetResult> {
      const now = new Date();
      const docs = await db.document.findMany({
        where: docsWhere(ws, kind, params, now),
        orderBy: [{ date: "desc" }, { number: "desc" }],
        include: { party: { select: { name: true, nameAr: true } } },
        take: 5000,
      });
      const sales = kind === "quote" || kind === "invoice";
      const payable = kind === "invoice" || kind === "bill";
      const status = params.get("status");
      const columns: Column[] = [
        { key: "number", label: "docs.colNumber", type: "text", width: 17 },
        { key: "date", label: "docs.colDate", type: "date", width: 13 },
        { key: "party", label: sales ? "docs.colCustomer" : "docs.colSupplier", type: "text", width: 32 },
        { key: "reference", label: kind === "bill" ? "docs.colSupplierRef" : "docs.colReference", type: "text", width: 16, hideOnMobile: true },
        { key: "due", label: kind === "quote" ? "docs.colValidUntil" : kind === "po" ? "docs.colExpected" : "docs.colDue", type: "date", width: 13, hideOnMobile: true },
        { key: "total", label: "docs.colTotal", type: "money", total: true, width: 15 },
        ...(payable ? [{ key: "balance", label: "docs.colBalance" as const, type: "money" as const, total: true, width: 15 }] : []),
        { key: "status", label: "docs.colStatus", type: "enum", options: statusOptions(kind), width: 14 },
      ];
      return {
        title: t(DOC_TITLE[kind]),
        subtitle: status ? t(`status.${status}` as MessageKey) : undefined,
        columns,
        rows: docs.map((d) => ({
          id: d.id,
          href: `${DOC_PATH[kind]}/${d.id}`,
          cells: {
            number: d.number,
            date: d.date.toISOString(),
            party: pick(locale, d.party.name, d.party.nameAr),
            reference: d.reference,
            due: d.dueDate?.toISOString() ?? null,
            total: d.total,
            balance: d.status === "void" || d.status === "draft" ? 0 : d.total - d.paid,
            status: displayStatus(d, now),
          },
        })),
      };
    },
  };
}

function partiesDataset(id: string, which: "customer" | "supplier"): Dataset<Workspace> {
  return {
    id,
    permissions: ["finance.view"],
    async load(ws, params, { locale, t }): Promise<DatasetResult> {
      const q = params.get("q")?.trim();
      const parties = await db.party.findMany({
        where: {
          orgId: ws.org.id,
          archived: params.get("archived") === "1",
          ...(which === "customer" ? { isCustomer: true } : { isSupplier: true }),
          ...(q ? { OR: [{ name: { contains: q } }, { nameAr: { contains: q } }, { phone: { contains: q } }, { email: { contains: q } }, { contactName: { contains: q } }] } : {}),
        },
        orderBy: { name: "asc" },
      });
      const kind = which === "customer" ? "invoice" : "bill";
      const [open, sales] = await Promise.all([
        db.document.groupBy({ by: ["partyId"], where: { orgId: ws.org.id, kind, status: { in: ["issued", "posted", "partial"] } }, _sum: { total: true, paid: true } }),
        db.document.groupBy({
          by: ["partyId"],
          where: { orgId: ws.org.id, kind, status: { in: ["issued", "posted", "partial", "paid"] }, date: { gte: new Date(Date.now() - 365 * 86400_000) } },
          _sum: { total: true },
        }),
      ]);
      const openBy = new Map(open.map((o) => [o.partyId, (o._sum.total ?? 0) - (o._sum.paid ?? 0)]));
      const yearBy = new Map(sales.map((o) => [o.partyId, o._sum.total ?? 0]));
      return {
        title: t(which === "customer" ? "nav.customers" : "nav.suppliers"),
        columns: [
          { key: "name", label: "parties.colName", type: "text", width: 34 },
          { key: "contact", label: "parties.colContact", type: "text", width: 20, hideOnMobile: true },
          { key: "phone", label: "parties.colPhone", type: "text", width: 16, hideOnMobile: true },
          { key: "terms", label: "parties.colTerms", type: "number", width: 10, hideOnMobile: true },
          { key: "year", label: which === "customer" ? "parties.colSales12" : "parties.colPurchases12", type: "money", total: true, width: 16 },
          { key: "open", label: which === "customer" ? "parties.colReceivable" : "parties.colPayable", type: "money", total: true, width: 16 },
        ],
        rows: parties.map((p) => ({
          id: p.id,
          href: `${which === "customer" ? "sales/customers" : "purchases/suppliers"}/${p.id}`,
          cells: { name: pick(locale, p.name, p.nameAr), contact: p.contactName, phone: p.phone, terms: p.paymentTerms, year: yearBy.get(p.id) ?? 0, open: openBy.get(p.id) ?? 0 },
          meta: { email: p.email, creditLimit: p.creditLimit },
        })),
      };
    },
  };
}

function paymentsDataset(id: string, direction: "in" | "out"): Dataset<Workspace> {
  return {
    id,
    permissions: ["finance.view"],
    async load(ws, params, { locale, t }): Promise<DatasetResult> {
      const q = params.get("q")?.trim();
      const payments = await db.payment.findMany({
        where: {
          orgId: ws.org.id,
          direction,
          ...(params.get("party") ? { partyId: params.get("party")! } : {}),
          ...(q ? { OR: [{ number: { contains: q.toUpperCase() } }, { reference: { contains: q } }, { party: { name: { contains: q } } }] } : {}),
        },
        orderBy: [{ date: "desc" }, { number: "desc" }],
        include: { party: { select: { name: true, nameAr: true } }, allocations: { include: { document: { select: { number: true } } } } },
        take: 5000,
      });
      const accounts = new Map((await db.account.findMany({ where: { orgId: ws.org.id, role: { in: ["cash", "bank"] } } })).map((a) => [a.id, pick(locale, a.name, a.nameAr)]));
      return {
        title: t(direction === "in" ? "nav.paymentsIn" : "nav.paymentsOut"),
        columns: [
          { key: "number", label: "docs.colNumber", type: "text", width: 17 },
          { key: "date", label: "docs.colDate", type: "date", width: 13 },
          { key: "party", label: direction === "in" ? "docs.colCustomer" : "docs.colSupplier", type: "text", width: 30 },
          { key: "method", label: "payments.colMethod", type: "enum", options: { cash: "payments.cash", transfer: "payments.transfer", cheque: "payments.cheque", card: "payments.card" }, width: 12, hideOnMobile: true },
          { key: "account", label: "payments.colAccount", type: "text", width: 20, hideOnMobile: true },
          { key: "applied", label: "payments.colApplied", type: "text", width: 26, hideOnMobile: true },
          { key: "amount", label: "docs.colAmount", type: "money", total: true, width: 15 },
          { key: "state", label: "docs.colStatus", type: "enum", options: { ok: "status.paid", void: "status.void" }, width: 12 },
        ],
        rows: payments.map((p) => ({
          id: p.id,
          cells: {
            number: p.number,
            date: p.date.toISOString(),
            party: pick(locale, p.party.name, p.party.nameAr),
            method: p.method,
            account: accounts.get(p.accountId) ?? "",
            applied: p.allocations.map((a) => a.document.number).join(", "),
            amount: p.voidedAt ? 0 : p.amount,
            state: p.voidedAt ? "void" : "ok",
          },
          meta: { reference: p.reference, partyId: p.partyId },
        })),
      };
    },
  };
}

export const quotationsDataset = documentsDataset("quotations", "quote");
export const invoicesDataset = documentsDataset("invoices", "invoice");
export const purchaseOrdersDataset = documentsDataset("purchase-orders", "po");
export const billsDocDataset = documentsDataset("supplier-bills", "bill");
export const customersDataset = partiesDataset("customers", "customer");
export const suppliersDataset = partiesDataset("suppliers", "supplier");
export const paymentsInDataset = paymentsDataset("payments-in", "in");
export const paymentsOutDataset = paymentsDataset("payments-out", "out");

export const DOC_DATASET: Record<DocKind, Dataset<Workspace>> = { quote: quotationsDataset, invoice: invoicesDataset, po: purchaseOrdersDataset, bill: billsDocDataset };
