import "server-only";
import { z } from "zod";
import { db } from "../../db";
import { pick } from "../../i18n";
import { toDirhams } from "../../money";
import { normalizeSearch } from "../../text";
import { canViewEntity } from "../../access";
import { LEAVE_TYPES } from "../../hr/ops";
import type { ProposalView } from "../types";
import { defineTool, stripWorkspace, toolError, ymd, type FlowCtx, type ToolOutcome } from "./define";

// Tools that suggest a change. They look things up and check what they can,
// then store a proposal and show it as a card. Nothing changes until the
// person presses Confirm; then the app's own action runs, with its own
// validation and permission checks (see ../execute.ts).

const tr = (ctx: FlowCtx, en: string, ar: string) => (ctx.locale === "ar" ? ar : en);
const money = (ctx: FlowCtx, dirhams: number) => ctx.fmt.money(dirhams, { decimals: true });
const date = (ctx: FlowCtx, ymdStr: string) => ctx.fmt.date(`${ymdStr}T12:00:00+03:00`);

function todayDoha(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Pick the record whose name best matches what the model wrote. */
function best<T>(items: T[], query: string, names: (t: T) => (string | null | undefined)[]): { match: T | null; candidates: T[] } {
  const q = normalizeSearch(query);
  if (!q) return { match: null, candidates: [] };
  const exact = items.filter((i) => names(i).some((n) => n && normalizeSearch(n) === q));
  if (exact.length === 1) return { match: exact[0], candidates: exact };
  const terms = q.split(" ");
  const partial = items.filter((i) => names(i).some((n) => n && terms.every((t) => normalizeSearch(n).includes(t))));
  if (partial.length === 1) return { match: partial[0], candidates: partial };
  return { match: null, candidates: exact.length ? exact : partial };
}

async function propose(ctx: FlowCtx, callId: string, kind: string, data: unknown, view: Omit<ProposalView, "id" | "kind" | "status">): Promise<ToolOutcome> {
  const p = await db.flowProposal.create({
    data: { orgId: ctx.ws.org.id, conversationId: ctx.conversationId, userId: ctx.ws.viewer.id, toolCallId: callId, kind, payload: JSON.parse(JSON.stringify({ data, view })) },
  });
  const full: ProposalView = { id: p.id, kind, status: "pending", ...view };
  return {
    content: {
      proposal_id: p.id,
      status: "Shown to the person as a card with a Confirm button. Nothing has changed yet: it happens only if they confirm. Don't say it's done.",
      summary: view.title,
      details: view.details,
    },
    ui: { label: tr(ctx, "Prepared a change for you to confirm", "جهّز تغييراً لتأكيده"), proposalId: p.id },
    proposal: full,
  };
}

const PREPARE_FAILED = (ctx: FlowCtx) => tr(ctx, "Couldn't prepare that", "تعذّر تجهيز ذلك");

async function category(ctx: FlowCtx, name: string) {
  const cats = await db.expenseCategory.findMany({ where: { orgId: ctx.ws.org.id, archived: false }, orderBy: { sort: "asc" } });
  const { match } = best(cats, name, (c) => [c.key, c.name, c.nameAr]);
  return { match, all: cats.map((c) => c.name) };
}

// ───────────────────────── Claims ─────────────────────────

export const proposeClaim = defineTool({
  name: "propose_claim",
  kind: "propose",
  description: "Prepare a new expense claim for the person to confirm (they can add a receipt photo afterwards). Amount in Qatari riyals.",
  input: z.object({
    amount: z.number().positive().max(10_000_000),
    merchant: z.string().min(1).max(120),
    category: z.string().describe("Expense category name, e.g. Groceries"),
    spent_on: ymd.optional().describe("Date YYYY-MM-DD; default today"),
    paid_with: z.enum(["cash", "card", "transfer"]).default("card"),
    note: z.string().max(500).default(""),
  }),
  available: (ws) => ws.can("claims.submit"),
  async run(ctx, i, callId) {
    const cat = await category(ctx, i.category);
    if (!cat.match) return toolError(`No category matches "${i.category}". Categories: ${cat.all.join(", ")}.`, PREPARE_FAILED(ctx));
    const spentOn = i.spent_on ?? todayDoha(ctx.now);
    const dirhams = toDirhams(i.amount);
    return propose(ctx, callId, "claim", { amount: (dirhams / 100).toFixed(2), merchant: i.merchant, categoryId: cat.match.id, spentOn, paidWith: i.paid_with, note: i.note, askApproval: false }, {
      title: tr(ctx, `New claim: ${money(ctx, dirhams)} at ${i.merchant}`, `مطالبة جديدة: ${money(ctx, dirhams)} في ${i.merchant}`),
      details: [
        { label: tr(ctx, "Amount", "المبلغ"), value: money(ctx, dirhams) },
        { label: tr(ctx, "Merchant", "المتجر"), value: i.merchant },
        { label: tr(ctx, "Category", "الفئة"), value: pick(ctx.locale, cat.match.name, cat.match.nameAr) },
        { label: tr(ctx, "Date", "التاريخ"), value: date(ctx, spentOn) },
        { label: tr(ctx, "Paid with", "طريقة الدفع"), value: ctx.t(`claims.${i.paid_with}`) },
        ...(i.note ? [{ label: tr(ctx, "Note", "ملاحظة"), value: i.note }] : []),
      ],
      note: tr(ctx, "You can add the receipt photo after it's saved.", "يمكنك إضافة صورة الإيصال بعد الحفظ."),
      confirmLabel: tr(ctx, "Submit claim", "تقديم المطالبة"),
    });
  },
});

export const proposeClaimDecision = defineTool({
  name: "propose_claim_decision",
  kind: "propose",
  description: "Prepare approving or declining a waiting expense claim, by its number (e.g. CLM-2026-00012). Declining needs a reason.",
  input: z.object({ claim: z.string().describe("Claim number"), decision: z.enum(["approve", "decline"]), note: z.string().max(300).default("") }),
  available: (ws) => ws.can("claims.approve"),
  async run(ctx, i, callId) {
    const c = await db.claim.findFirst({ where: { orgId: ctx.ws.org.id, number: i.claim.trim().toUpperCase(), deletedAt: null }, include: { submittedBy: { select: { name: true, nameAr: true } }, category: true } });
    if (!c) return toolError(`No claim numbered ${i.claim}.`, PREPARE_FAILED(ctx));
    if (c.status !== "submitted") return toolError(`${c.number} isn't waiting for a decision (it's ${c.status}).`, PREPARE_FAILED(ctx));
    if (i.decision === "decline" && !i.note.trim()) return toolError("Declining needs a reason. Ask the person for one.", PREPARE_FAILED(ctx));
    const who = pick(ctx.locale, c.submittedBy.name, c.submittedBy.nameAr);
    return propose(ctx, callId, "claimDecision", { id: c.id, decision: i.decision, note: i.note }, {
      title: i.decision === "approve" ? tr(ctx, `Approve ${c.number}`, `اعتماد ${c.number}`) : tr(ctx, `Decline ${c.number}`, `رفض ${c.number}`),
      details: [
        { label: tr(ctx, "From", "من"), value: who },
        { label: tr(ctx, "Amount", "المبلغ"), value: money(ctx, c.amount) },
        { label: tr(ctx, "Merchant", "المتجر"), value: c.merchant },
        { label: tr(ctx, "Category", "الفئة"), value: pick(ctx.locale, c.category.name, c.category.nameAr) },
        { label: tr(ctx, "Date", "التاريخ"), value: ctx.fmt.date(c.spentOn.toISOString()) },
        ...(i.note ? [{ label: i.decision === "decline" ? tr(ctx, "Reason", "السبب") : tr(ctx, "Note", "ملاحظة"), value: i.note }] : []),
      ],
      confirmLabel: i.decision === "approve" ? tr(ctx, "Approve", "اعتماد") : tr(ctx, "Decline", "رفض"),
    });
  },
});

// ───────────────────────── Home ─────────────────────────

export const proposeBill = defineTool({
  name: "propose_bill",
  kind: "propose",
  description: "Prepare a new recurring household bill (e.g. Kahramaa, Ooredoo, rent, school fees) with reminders.",
  input: z.object({
    name: z.string().min(1).max(80),
    provider: z.string().max(80).default(""),
    category: z.string(),
    amount: z.number().positive(),
    frequency: z.enum(["monthly", "quarterly", "yearly"]).default("monthly"),
    next_due: ymd,
    variable: z.boolean().default(false).describe("Amount changes each time (e.g. electricity)"),
    autopay: z.boolean().default(false),
    remind_days_before: z.number().int().min(0).max(60).default(3),
  }),
  available: (ws) => ws.orgType === "home" && ws.can("bills.manage"),
  async run(ctx, i, callId) {
    const cat = await category(ctx, i.category);
    if (!cat.match) return toolError(`No category matches "${i.category}". Categories: ${cat.all.join(", ")}.`, PREPARE_FAILED(ctx));
    const dirhams = toDirhams(i.amount);
    return propose(ctx, callId, "bill", { name: i.name, nameAr: "", provider: i.provider, categoryId: cat.match.id, amount: (dirhams / 100).toFixed(2), variable: i.variable, frequency: i.frequency, nextDue: i.next_due, remindDaysBefore: i.remind_days_before, autopay: i.autopay, notes: "" }, {
      title: tr(ctx, `New bill: ${i.name}`, `فاتورة جديدة: ${i.name}`),
      details: [
        { label: tr(ctx, "Amount", "المبلغ"), value: `${money(ctx, dirhams)}${i.variable ? tr(ctx, " (varies)", " (متغير)") : ""}` },
        { label: tr(ctx, "Every", "التكرار"), value: ctx.t(`bills.${i.frequency}`) },
        { label: tr(ctx, "Next due", "الاستحقاق التالي"), value: date(ctx, i.next_due) },
        { label: tr(ctx, "Category", "الفئة"), value: pick(ctx.locale, cat.match.name, cat.match.nameAr) },
        ...(i.provider ? [{ label: tr(ctx, "Provider", "الجهة"), value: i.provider }] : []),
      ],
      confirmLabel: tr(ctx, "Add bill", "إضافة الفاتورة"),
    });
  },
});

export const proposeBudget = defineTool({
  name: "propose_budget",
  kind: "propose",
  description: "Prepare setting the monthly budget for a spending category.",
  input: z.object({ category: z.string(), month: z.string().regex(/^\d{4}-\d{2}$/).describe("YYYY-MM"), amount: z.number().min(0) }),
  available: (ws) => ws.orgType === "home" && ws.can("budgets.manage"),
  async run(ctx, i, callId) {
    const cat = await category(ctx, i.category);
    if (!cat.match) return toolError(`No category matches "${i.category}". Categories: ${cat.all.join(", ")}.`, PREPARE_FAILED(ctx));
    const dirhams = toDirhams(i.amount);
    return propose(ctx, callId, "budget", { categoryId: cat.match.id, month: i.month, amount: (dirhams / 100).toFixed(2) }, {
      title: tr(ctx, `Budget for ${cat.match.name}: ${money(ctx, dirhams)}`, `ميزانية ${cat.match.nameAr}: ${money(ctx, dirhams)}`),
      details: [
        { label: tr(ctx, "Category", "الفئة"), value: pick(ctx.locale, cat.match.name, cat.match.nameAr) },
        { label: tr(ctx, "Month", "الشهر"), value: ctx.fmt.monthName(new Date(`${i.month}-15T12:00:00+03:00`)) },
        { label: tr(ctx, "Budget", "الميزانية"), value: money(ctx, dirhams) },
      ],
      confirmLabel: tr(ctx, "Set budget", "تعيين الميزانية"),
    });
  },
});

const POSSESSION_TYPES = ["Electronics", "Appliances", "Furniture", "Vehicle", "Jewellery", "Other"] as const;

export const proposePossession = defineTool({
  name: "propose_possession",
  kind: "propose",
  description: "Prepare adding something the family owns to the list, with its warranty date.",
  input: z.object({
    name: z.string().min(1).max(120),
    category: z.enum(POSSESSION_TYPES).default("Other"),
    room: z.string().max(60).default(""),
    brand: z.string().max(60).default(""),
    model: z.string().max(60).default(""),
    purchased_on: ymd.optional(),
    price: z.number().min(0).optional(),
    store: z.string().max(80).default(""),
    warranty_until: ymd.optional(),
  }),
  available: (ws) => ws.orgType === "home" && ws.can("possessions.manage"),
  async run(ctx, i, callId) {
    const price = i.price != null ? toDirhams(i.price) : null;
    return propose(ctx, callId, "possession", { name: i.name, nameAr: "", category: i.category, room: i.room, brand: i.brand, model: i.model, serial: "", purchasedOn: i.purchased_on ?? "", price: price != null ? (price / 100).toFixed(2) : "", store: i.store, warrantyUntil: i.warranty_until ?? "", notes: "" }, {
      title: tr(ctx, `Add ${i.name} to things we own`, `إضافة ${i.name} إلى مقتنياتنا`),
      details: [
        { label: tr(ctx, "Type", "النوع"), value: i.category },
        ...(i.brand || i.model ? [{ label: tr(ctx, "Brand / model", "العلامة / الطراز"), value: [i.brand, i.model].filter(Boolean).join(" ") }] : []),
        ...(i.room ? [{ label: tr(ctx, "Room", "الغرفة"), value: i.room }] : []),
        ...(price != null ? [{ label: tr(ctx, "Price", "السعر"), value: money(ctx, price) }] : []),
        ...(i.store ? [{ label: tr(ctx, "Store", "المتجر"), value: i.store }] : []),
        ...(i.purchased_on ? [{ label: tr(ctx, "Bought", "تاريخ الشراء"), value: date(ctx, i.purchased_on) }] : []),
        ...(i.warranty_until ? [{ label: tr(ctx, "Warranty until", "الضمان حتى"), value: date(ctx, i.warranty_until) }] : []),
      ],
      confirmLabel: tr(ctx, "Add", "إضافة"),
    });
  },
});

// ───────────────────────── Business ─────────────────────────

const DOC_KINDS = { quotation: "quote", invoice: "invoice", purchase_order: "po", supplier_bill: "bill" } as const;

export const proposeDocument = defineTool({
  name: "propose_document",
  kind: "propose",
  description:
    "Prepare a draft quotation, sales invoice, purchase order or supplier bill. Name the customer or supplier and list the lines; items can be named by SKU or name (their usual price is used unless you give one). Amounts in Qatari riyals. It is saved as a draft for the person to review and issue.",
  input: z.object({
    kind: z.enum(["quotation", "invoice", "purchase_order", "supplier_bill"]),
    party: z.string().describe("Customer (sales) or supplier (purchases) name"),
    date: ymd.optional(),
    due_date: ymd.optional(),
    reference: z.string().max(80).default(""),
    notes: z.string().max(2000).default(""),
    lines: z
      .array(
        z.object({
          item: z.string().optional().describe("SKU or item name"),
          description: z.string().max(500).optional(),
          qty: z.number().positive().max(1_000_000),
          unit_price: z.number().min(0).optional().describe("Riyals; default the item's price"),
          discount_percent: z.number().min(0).max(100).default(0),
        }),
      )
      .min(1)
      .max(50),
  }),
  available: (ws) => ws.orgType === "business" && ws.can("finance.manage"),
  async run(ctx, i, callId) {
    const kind = DOC_KINDS[i.kind];
    const sales = kind === "quote" || kind === "invoice";
    const parties = await db.party.findMany({ where: { orgId: ctx.ws.org.id, archived: false, ...(sales ? { isCustomer: true } : { isSupplier: true }) } });
    const { match: party, candidates } = best(parties, i.party, (p) => [p.name, p.nameAr]);
    if (!party) return toolError(candidates.length ? `Several ${sales ? "customers" : "suppliers"} match "${i.party}": ${candidates.slice(0, 6).map((p) => p.name).join(", ")}. Ask which one.` : `No ${sales ? "customer" : "supplier"} matches "${i.party}".`, PREPARE_FAILED(ctx));
    const items = await db.item.findMany({ where: { orgId: ctx.ws.org.id, archived: false } });
    const lines: { itemId: string | null; description: string; qty: number; unitPrice: number; discountPct: number }[] = [];
    for (const l of i.lines) {
      let item = null;
      if (l.item) {
        item = items.find((x) => x.sku.toLowerCase() === l.item!.toLowerCase()) ?? best(items, l.item, (x) => [x.name, x.nameAr, x.sku]).match;
        if (!item) return toolError(`No item matches "${l.item}". Use search_records to find it, or give a description and a price instead.`, PREPARE_FAILED(ctx));
      }
      const unitPrice = l.unit_price != null ? toDirhams(l.unit_price) : item ? (sales ? item.salePrice : item.purchasePrice) : null;
      if (unitPrice == null) return toolError(`The line "${l.description ?? ""}" needs a unit price.`, PREPARE_FAILED(ctx));
      const description = l.description || (item ? pick(ctx.locale, item.name, item.nameAr) : "");
      if (!description) return toolError("Each line needs an item or a description.", PREPARE_FAILED(ctx));
      lines.push({ itemId: item?.id ?? null, description, qty: Math.round(l.qty * 100), unitPrice, discountPct: Math.round(l.discount_percent * 100) });
    }
    const docDate = i.date ?? todayDoha(ctx.now);
    const due = i.due_date ?? (kind === "invoice" || kind === "bill" ? new Date(new Date(`${docDate}T12:00:00Z`).getTime() + party.paymentTerms * 86400_000).toISOString().slice(0, 10) : null);
    const total = lines.reduce((s, l) => s + Math.round(((l.qty / 100) * l.unitPrice * (10000 - l.discountPct)) / 10000), 0);
    const word = { quote: tr(ctx, "quotation", "عرض سعر"), invoice: tr(ctx, "invoice", "فاتورة"), po: tr(ctx, "purchase order", "أمر شراء"), bill: tr(ctx, "supplier bill", "فاتورة مورد") }[kind];
    return propose(ctx, callId, "document", { kind, input: { partyId: party.id, date: docDate, dueDate: due, reference: i.reference, notes: i.notes, terms: "", lines } }, {
      title: tr(ctx, `Draft ${word} for ${party.name} · ${money(ctx, total)}`, `مسودة ${word} لـ ${pick("ar", party.name, party.nameAr)} · ${money(ctx, total)}`),
      details: [
        ...lines.map((l) => ({ label: l.description, value: `${ctx.fmt.number(l.qty / 100)} × ${money(ctx, l.unitPrice)}${l.discountPct ? ` −${l.discountPct / 100}%` : ""}` })),
        { label: tr(ctx, "Total", "الإجمالي"), value: money(ctx, total) },
        { label: tr(ctx, "Date", "التاريخ"), value: date(ctx, docDate) },
        ...(due ? [{ label: tr(ctx, "Due", "الاستحقاق"), value: date(ctx, due) }] : []),
      ],
      note: tr(ctx, "Saved as a draft: nothing is posted until you issue it.", "يُحفظ كمسودة: لا يُرحّل شيء حتى تصدره."),
      confirmLabel: tr(ctx, "Save draft", "حفظ المسودة"),
    });
  },
});

export const proposePayment = defineTool({
  name: "propose_payment",
  kind: "propose",
  description: "Prepare recording a payment received from a customer (direction in) or paid to a supplier (direction out). It's applied to their oldest open invoices or bills unless you name documents. Amount in Qatari riyals.",
  input: z.object({
    direction: z.enum(["in", "out"]),
    party: z.string(),
    amount: z.number().positive(),
    date: ymd.optional(),
    method: z.enum(["transfer", "cash", "cheque", "card"]).default("transfer"),
    reference: z.string().max(80).default(""),
    documents: z.array(z.string()).default([]).describe("Invoice or bill numbers to pay, oldest first if empty"),
  }),
  available: (ws) => ws.orgType === "business" && ws.can("finance.manage"),
  async run(ctx, i, callId) {
    const parties = await db.party.findMany({ where: { orgId: ctx.ws.org.id, archived: false, ...(i.direction === "in" ? { isCustomer: true } : { isSupplier: true }) } });
    const { match: party, candidates } = best(parties, i.party, (p) => [p.name, p.nameAr]);
    if (!party) return toolError(candidates.length ? `Several match "${i.party}": ${candidates.slice(0, 6).map((p) => p.name).join(", ")}.` : `No ${i.direction === "in" ? "customer" : "supplier"} matches "${i.party}".`, PREPARE_FAILED(ctx));
    const docs = await db.document.findMany({ where: { orgId: ctx.ws.org.id, partyId: party.id, kind: i.direction === "in" ? "invoice" : "bill", status: { in: ["issued", "posted", "partial"] } }, orderBy: [{ dueDate: "asc" }, { date: "asc" }] });
    const wanted = i.documents.map((n) => n.trim().toUpperCase());
    const chosen = wanted.length ? docs.filter((d) => wanted.includes(d.number)) : docs;
    let left = toDirhams(i.amount);
    const allocations = chosen.map((d) => {
      const take = Math.min(left, d.total - d.paid);
      left -= take;
      return { documentId: d.id, amount: take, number: d.number };
    }).filter((a) => a.amount > 0);
    const accounts = await db.account.findMany({ where: { orgId: ctx.ws.org.id, role: { in: ["cash", "bank"] }, archived: false }, orderBy: { code: "asc" } });
    const account = accounts.find((a) => a.role === (i.method === "cash" ? "cash" : "bank")) ?? accounts[0];
    if (!account) return toolError("No bank or cash account is set up.", PREPARE_FAILED(ctx));
    const dirhams = toDirhams(i.amount);
    const payDate = i.date ?? todayDoha(ctx.now);
    return propose(ctx, callId, "payment", { direction: i.direction, partyId: party.id, date: payDate, amount: (dirhams / 100).toFixed(2), method: i.method, accountId: account.id, reference: i.reference, notes: "", allocations: allocations.map(({ documentId, amount }) => ({ documentId, amount })) }, {
      title: i.direction === "in" ? tr(ctx, `Payment from ${party.name}: ${money(ctx, dirhams)}`, `دفعة من ${pick("ar", party.name, party.nameAr)}: ${money(ctx, dirhams)}`) : tr(ctx, `Payment to ${party.name}: ${money(ctx, dirhams)}`, `دفعة إلى ${pick("ar", party.name, party.nameAr)}: ${money(ctx, dirhams)}`),
      details: [
        { label: tr(ctx, "Amount", "المبلغ"), value: money(ctx, dirhams) },
        { label: tr(ctx, "Date", "التاريخ"), value: date(ctx, payDate) },
        { label: tr(ctx, "Method", "الطريقة"), value: ctx.t(`fees.method_${i.method}`) },
        { label: tr(ctx, "Account", "الحساب"), value: pick(ctx.locale, account.name, account.nameAr) },
        ...allocations.map((a) => ({ label: a.number, value: money(ctx, a.amount) })),
        ...(left > 0 ? [{ label: tr(ctx, "Kept as credit", "رصيد دائن"), value: money(ctx, left) }] : []),
      ],
      confirmLabel: tr(ctx, "Record payment", "تسجيل الدفعة"),
    });
  },
});

// ───────────────────────── People ─────────────────────────

export const proposeLeaveRequest = defineTool({
  name: "propose_leave_request",
  kind: "propose",
  description: "Prepare a leave request for the person asking (they must be on the staff list).",
  input: z.object({ type: z.enum(LEAVE_TYPES), start: ymd, end: ymd, reason: z.string().max(500).default("") }),
  available: (ws) => ws.orgType !== "home" && ws.can("claims.submit"),
  async run(ctx, i, callId) {
    const emp = await db.employee.findFirst({ where: { orgId: ctx.ws.org.id, userId: ctx.ws.viewer.id, status: "active" } });
    if (!emp) return toolError("This person isn't linked to an employee record, so they can't request leave here.", PREPARE_FAILED(ctx));
    if (i.end < i.start) return toolError("The end date is before the start date.", PREPARE_FAILED(ctx));
    return propose(ctx, callId, "leaveRequest", { employeeId: null, type: i.type, start: i.start, end: i.end, reason: i.reason }, {
      title: tr(ctx, `Request ${ctx.t(`hr.leave_${i.type}`).toLowerCase()} leave`, `طلب ${ctx.t(`hr.leave_${i.type}`)}`),
      details: [
        { label: tr(ctx, "From", "من"), value: date(ctx, i.start) },
        { label: tr(ctx, "To", "إلى"), value: date(ctx, i.end) },
        ...(i.reason ? [{ label: tr(ctx, "Reason", "السبب"), value: i.reason }] : []),
      ],
      confirmLabel: tr(ctx, "Send request", "إرسال الطلب"),
    });
  },
});

export const proposeLeaveDecision = defineTool({
  name: "propose_leave_decision",
  kind: "propose",
  description: "Prepare approving or declining a waiting leave request, by its number.",
  input: z.object({ request: z.string().describe("Leave request number"), decision: z.enum(["approve", "reject"]), note: z.string().max(300).default("") }),
  available: (ws) => ws.orgType !== "home" && (ws.can("leave.approve") || ws.can("hr.manage")),
  async run(ctx, i, callId) {
    const r = await db.leaveRequest.findFirst({ where: { orgId: ctx.ws.org.id, number: i.request.trim().toUpperCase() }, include: { employee: true } });
    if (!r) return toolError(`No leave request numbered ${i.request}.`, PREPARE_FAILED(ctx));
    if (r.status !== "submitted") return toolError(`${r.number} isn't waiting for a decision (it's ${r.status}).`, PREPARE_FAILED(ctx));
    return propose(ctx, callId, "leaveDecision", { id: r.id, decision: i.decision, note: i.note }, {
      title: i.decision === "approve" ? tr(ctx, `Approve leave ${r.number}`, `اعتماد الإجازة ${r.number}`) : tr(ctx, `Decline leave ${r.number}`, `رفض الإجازة ${r.number}`),
      details: [
        { label: tr(ctx, "Employee", "الموظف"), value: pick(ctx.locale, r.employee.name, r.employee.nameAr) },
        { label: tr(ctx, "Type", "النوع"), value: ctx.t(`hr.leave_${r.type as (typeof LEAVE_TYPES)[number]}`) },
        { label: tr(ctx, "Dates", "التواريخ"), value: `${ctx.fmt.date(r.startDate.toISOString())} – ${ctx.fmt.date(r.endDate.toISOString())}` },
        { label: tr(ctx, "Working days", "أيام العمل"), value: ctx.fmt.number(r.days) },
        ...(i.note ? [{ label: tr(ctx, "Note", "ملاحظة"), value: i.note }] : []),
      ],
      confirmLabel: i.decision === "approve" ? tr(ctx, "Approve", "اعتماد") : tr(ctx, "Decline", "رفض"),
    });
  },
});

// ───────────────────────── School ─────────────────────────

export const proposeAnnouncement = defineTool({
  name: "propose_announcement",
  kind: "propose",
  description: "Prepare a school announcement for everyone, staff only or parents only, optionally for one campus or grade. Write it in English, and also in Arabic (title_ar, body_ar) when you can.",
  input: z.object({
    audience: z.enum(["everyone", "staff", "parents"]),
    campus: z.string().optional().describe("Campus name; empty = all"),
    grade: z.string().optional().describe("Grade name or level, e.g. Grade 5 or 5; empty = all"),
    title: z.string().min(2).max(140),
    body: z.string().min(2).max(4000),
    title_ar: z.string().max(140).default(""),
    body_ar: z.string().max(4000).default(""),
    pinned: z.boolean().default(false),
  }),
  available: (ws) => ws.orgType === "school" && ws.can("school.manage"),
  async run(ctx, i, callId) {
    const s = await ctx.school();
    if (!s) return toolError("Not a school.", PREPARE_FAILED(ctx));
    let campusId = "";
    if (i.campus) {
      const { match } = best(ctx.ws.org.campuses.filter((c) => s.campusIds.includes(c.id)), i.campus, (c) => [c.name, c.nameAr, c.code]);
      if (!match) return toolError(`No campus matches "${i.campus}".`, PREPARE_FAILED(ctx));
      campusId = match.id;
    }
    let gradeId = "";
    let gradeName = "";
    if (i.grade) {
      const grades = await db.grade.findMany({ where: { orgId: ctx.ws.org.id } });
      const level = Number(i.grade.replace(/\D/g, ""));
      const g = grades.find((x) => /^\d+$/.test(i.grade!.trim()) && x.level === level) ?? best(grades, i.grade, (x) => [x.name, x.nameAr]).match;
      if (!g) return toolError(`No grade matches "${i.grade}".`, PREPARE_FAILED(ctx));
      gradeId = g.id;
      gradeName = pick(ctx.locale, g.name, g.nameAr);
    }
    const campusName = campusId ? pick(ctx.locale, ctx.ws.org.campuses.find((c) => c.id === campusId)!.name, ctx.ws.org.campuses.find((c) => c.id === campusId)!.nameAr) : tr(ctx, "All campuses", "كل الفروع");
    return propose(ctx, callId, "announcement", { audience: i.audience, campusId, gradeId, title: i.title, titleAr: i.title_ar, body: i.body, bodyAr: i.body_ar, pinned: i.pinned }, {
      title: tr(ctx, `Announce: ${i.title}`, `إعلان: ${i.title_ar || i.title}`),
      details: [
        { label: tr(ctx, "For", "إلى"), value: [ctx.t(`announcements.audience_${i.audience}`), campusName, gradeName].filter(Boolean).join(" · ") },
        { label: tr(ctx, "Message", "النص"), value: ctx.locale === "ar" && i.body_ar ? i.body_ar : i.body },
        ...(i.pinned ? [{ label: tr(ctx, "Pinned", "مثبّت"), value: tr(ctx, "Yes", "نعم") }] : []),
      ],
      note: tr(ctx, "Everyone it's for gets a notification.", "يصل إشعار لكل من يعنيه الإعلان."),
      confirmLabel: tr(ctx, "Publish", "نشر"),
    });
  },
});

export const proposeFeePayment = defineTool({
  name: "propose_fee_payment",
  kind: "propose",
  description: "Prepare recording a school fee payment from a family, found by a parent's or child's name. It's applied to the family's oldest open fee invoices. Amount in Qatari riyals.",
  input: z.object({
    family: z.string().describe("A parent's or child's name"),
    amount: z.number().positive(),
    method: z.enum(["transfer", "card", "cash", "cheque"]).default("transfer"),
    date: ymd.optional(),
    reference: z.string().max(60).default(""),
  }),
  available: (ws) => ws.orgType === "school" && (ws.can("finance.manage") || ws.can("school.manage")),
  async run(ctx, i, callId) {
    const s = await ctx.school();
    if (!s) return toolError("Not a school.", PREPARE_FAILED(ctx));
    const guardians = await db.guardian.findMany({
      where: { orgId: ctx.ws.org.id, partyId: { not: null }, children: { some: { student: { campusId: { in: s.campusIds } } } } },
      include: { children: { include: { student: { select: { name: true, nameAr: true } } } } },
    });
    let { match } = best(guardians, i.family, (g) => [g.name, g.nameAr]);
    if (!match) match = best(guardians, i.family, (g) => g.children.flatMap((c) => [c.student.name, c.student.nameAr])).match;
    if (!match?.partyId) return toolError(`Couldn't find one family for "${i.family}". Try the full name of a parent or child.`, PREPARE_FAILED(ctx));
    const docs = await db.document.findMany({ where: { orgId: ctx.ws.org.id, partyId: match.partyId, kind: "fee", status: { in: ["issued", "partial"] } }, orderBy: [{ dueDate: "asc" }, { date: "asc" }], include: { student: { select: { name: true, nameAr: true } } } });
    if (!docs.length) return toolError(`${match.name}'s family has no open fee invoices.`, PREPARE_FAILED(ctx));
    let left = toDirhams(i.amount);
    const allocations = docs
      .map((d) => {
        const take = Math.min(left, d.total - d.paid);
        left -= take;
        return { documentId: d.id, amount: take, label: `${d.number} · ${pick(ctx.locale, d.student?.name ?? "", d.student?.nameAr ?? null)}` };
      })
      .filter((a) => a.amount > 0);
    const accounts = await db.account.findMany({ where: { orgId: ctx.ws.org.id, role: { in: ["cash", "bank"] } }, orderBy: { code: "asc" } });
    const account = accounts.find((a) => a.role === (i.method === "cash" ? "cash" : "bank")) ?? accounts[0];
    if (!account) return toolError("No bank or cash account is set up.", PREPARE_FAILED(ctx));
    const dirhams = toDirhams(i.amount);
    const payDate = i.date ?? todayDoha(ctx.now);
    return propose(ctx, callId, "feePayment", { partyId: match.partyId, date: payDate, amount: (dirhams / 100).toFixed(2), method: i.method, accountId: account.id, reference: i.reference, allocations: allocations.map(({ documentId, amount }) => ({ documentId, amount })) }, {
      title: tr(ctx, `Fee payment from ${match.name}: ${money(ctx, dirhams)}`, `دفعة رسوم من ${pick("ar", match.name, match.nameAr)}: ${money(ctx, dirhams)}`),
      details: [
        { label: tr(ctx, "Amount", "المبلغ"), value: money(ctx, dirhams) },
        { label: tr(ctx, "Method", "الطريقة"), value: ctx.t(`fees.method_${i.method}`) },
        { label: tr(ctx, "Date", "التاريخ"), value: date(ctx, payDate) },
        ...allocations.map((a) => ({ label: a.label, value: money(ctx, a.amount) })),
        ...(left > 0 ? [{ label: tr(ctx, "More than is owed", "أكثر من المستحق"), value: money(ctx, left) }] : []),
      ],
      ...(left > 0 ? { note: tr(ctx, "The amount is more than the family owes; the rest is kept as credit.", "المبلغ أكبر مما على العائلة؛ يبقى الباقي رصيداً لها.") } : {}),
      confirmLabel: tr(ctx, "Record payment", "تسجيل الدفعة"),
    });
  },
});

export const proposeFeeReminders = defineTool({
  name: "propose_fee_reminders",
  kind: "propose",
  description: "Prepare sending a reminder to every family with overdue school fees.",
  input: z.object({}),
  available: (ws) => ws.orgType === "school" && (ws.can("finance.manage") || ws.can("school.manage")),
  async run(ctx, _i, callId) {
    const s = await ctx.school();
    if (!s) return toolError("Not a school.", PREPARE_FAILED(ctx));
    const overdue = await db.document.findMany({ where: { orgId: ctx.ws.org.id, kind: "fee", status: { in: ["issued", "partial"] }, dueDate: { lt: ctx.now }, student: { campusId: { in: s.campusIds } } }, select: { partyId: true, total: true, paid: true } });
    const families = new Set(overdue.map((d) => d.partyId)).size;
    if (!families) return toolError("No family has overdue fees right now.", PREPARE_FAILED(ctx));
    const amount = overdue.reduce((x, d) => x + d.total - d.paid, 0);
    return propose(ctx, callId, "feeReminders", {}, {
      title: tr(ctx, `Remind ${families} families about overdue fees`, `تذكير ${families} عائلة بالرسوم المتأخرة`),
      details: [
        { label: tr(ctx, "Families", "العائلات"), value: ctx.fmt.number(families) },
        { label: tr(ctx, "Overdue", "المتأخر"), value: money(ctx, amount) },
      ],
      note: tr(ctx, "Parents with the app get a notification; the others are listed for a phone call.", "يصل إشعار لأولياء الأمور الذين لديهم التطبيق، والباقون يظهرون في قائمة للاتصال."),
      confirmLabel: tr(ctx, "Send reminders", "إرسال التذكيرات"),
    });
  },
});

// ───────────────────────── Notes on records ─────────────────────────

function entityFromLink(path: string): { type: string; id: string } | null {
  const rules: [RegExp, string][] = [
    [/^claims\/([\w-]+)/, "claim"],
    [/^(?:sales\/(?:invoices|quotations)|purchases\/(?:orders|bills)|fees\/invoices)\/([\w-]+)/, "document"],
    [/^(?:sales\/customers|purchases\/suppliers)\/([\w-]+)/, "party"],
    [/^inventory\/items\/([\w-]+)/, "item"],
    [/^hr\/employees\/([\w-]+)/, "employee"],
    [/^students\/([\w-]+)/, "student"],
    [/^guardians\/([\w-]+)/, "guardian"],
    [/^admissions\?open=([\w-]+)/, "application"],
  ];
  for (const [re, type] of rules) {
    const m = path.match(re);
    if (m) return { type, id: m[1] };
  }
  return null;
}

export const proposeComment = defineTool({
  name: "propose_comment",
  kind: "propose",
  description: "Prepare adding a comment or note to a record's thread (a claim, invoice, customer, employee, student, application...). Give the record's link.",
  input: z.object({ link: z.string(), text: z.string().min(1).max(2000) }),
  available: () => true,
  async run(ctx, i, callId) {
    const path = stripWorkspace(i.link, ctx.slug);
    const e = entityFromLink(path);
    if (!e || !(await canViewEntity(ctx.ws, e.type, e.id))) return toolError("That record doesn't exist or this person can't comment on it.", PREPARE_FAILED(ctx));
    return propose(ctx, callId, "comment", { entityType: e.type, entityId: e.id, body: i.text, href: path }, {
      title: tr(ctx, "Add a comment", "إضافة تعليق"),
      details: [{ label: tr(ctx, "Comment", "التعليق"), value: i.text }],
      confirmLabel: tr(ctx, "Post comment", "نشر التعليق"),
    });
  },
});

export const PROPOSE_TOOLS = [proposeClaim, proposeClaimDecision, proposeBill, proposeBudget, proposePossession, proposeDocument, proposePayment, proposeLeaveRequest, proposeLeaveDecision, proposeAnnouncement, proposeFeePayment, proposeFeeReminders, proposeComment];
