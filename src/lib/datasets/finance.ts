import "server-only";
import { db } from "../db";
import type { Workspace } from "../auth/dal";
import { pick, type MessageKey } from "../i18n";
import { createFormatter } from "../format";
import { accountBalances, aging, balanceSheet, cashFlow, profitAndLoss, type AccountBalance } from "../ledger/reports";
import { stockValue } from "../docs/math";
import { bizSettings } from "../biz";
import type { Column, Dataset, DatasetResult, Row } from "./types";

// Financial statements and analysis reports. Each is a dataset, so it prints
// and exports like every other table. Periods come from ?from=&to= (YYYY-MM-DD).

const DAY = 86400_000;
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(d);
const startOf = (s: string) => new Date(`${s}T00:00:00+03:00`);

export interface Period {
  from: Date;
  /** exclusive */
  to: Date;
  fromKey: string;
  toKey: string;
}

/** The report period: explicit dates, or the financial year to date. */
export function periodOf(ws: Workspace, params: URLSearchParams): Period {
  const today = ymd(new Date());
  const fyStart = bizSettings(ws.org).fiscalYearStartMonth ?? 1;
  const [y, m] = today.split("-").map(Number);
  const fyYear = m >= fyStart ? y : y - 1;
  const defFrom = `${fyYear}-${String(fyStart).padStart(2, "0")}-01`;
  const fromKey = /^\d{4}-\d{2}-\d{2}$/.test(params.get("from") ?? "") ? params.get("from")! : defFrom;
  const toKey = /^\d{4}-\d{2}-\d{2}$/.test(params.get("to") ?? "") ? params.get("to")! : today;
  return { from: startOf(fromKey), to: new Date(startOf(toKey).getTime() + DAY), fromKey, toKey };
}

/** The same length of time immediately before. */
function previous(p: Period): Period {
  const len = p.to.getTime() - p.from.getTime();
  const to = p.from;
  const from = new Date(to.getTime() - len);
  return { from, to, fromKey: ymd(from), toKey: ymd(new Date(to.getTime() - DAY)) };
}

function periodLabel(locale: "en" | "ar", p: Period) {
  const fmt = createFormatter({ locale, digits: "latn" });
  return `${fmt.date(p.from)} – ${fmt.date(new Date(p.to.getTime() - DAY))}`;
}

const heading = (id: string, label: string, extra: Record<string, string | number | null> = {}): Row => ({ id, cells: { account: label, ...extra }, emphasis: "heading" });

export const plDataset: Dataset<Workspace> = {
  id: "pl",
  permissions: ["finance.view"],
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const p = periodOf(ws, params);
    const prev = previous(p);
    const [cur, old] = await Promise.all([profitAndLoss(db, ws.org.id, p.from, p.to), profitAndLoss(db, ws.org.id, prev.from, prev.to)]);
    const prevBy = new Map([...old.income, ...old.cogs, ...old.expenses].map((a) => [a.id, a.balance]));
    const change = (a: number, b: number) => (b ? (a - b) / Math.abs(b) : null);
    const line = (a: AccountBalance): Row => ({
      id: a.id,
      href: `reports/ledger?account=${a.id}&from=${p.fromKey}&to=${p.toKey}`,
      cells: { account: `${a.code} · ${pick(locale, a.name, a.nameAr)}`, current: a.balance, previous: prevBy.get(a.id) ?? 0, change: change(a.balance, prevBy.get(a.id) ?? 0) },
    });
    const sub = (id: string, label: MessageKey, a: number, b: number, emphasis: "subtotal" | "total" = "subtotal"): Row => ({ id, cells: { account: t(label), current: a, previous: b, change: change(a, b) }, emphasis });
    const rows: Row[] = [
      heading("h-income", t("reports.income")),
      ...cur.income.map(line),
      sub("s-income", "reports.totalIncome", cur.totalIncome, old.totalIncome),
      heading("h-cogs", t("reports.costOfSales")),
      ...cur.cogs.map(line),
      sub("s-cogs", "reports.totalCostOfSales", cur.totalCogs, old.totalCogs),
      sub("t-gross", "reports.grossProfit", cur.grossProfit, old.grossProfit, "total"),
      heading("h-exp", t("reports.operatingExpenses")),
      ...cur.expenses.map(line),
      sub("s-exp", "reports.totalExpenses", cur.totalExpenses, old.totalExpenses),
      sub("t-net", "reports.netProfit", cur.netProfit, old.netProfit, "total"),
    ];
    return {
      title: t("reports.pl"),
      subtitle: t("reports.comparedWith", { period: periodLabel(locale, p), previous: periodLabel(locale, prev) }),
      columns: [
        { key: "account", label: "reports.colAccount", type: "text", width: 40 },
        { key: "current", label: "reports.colThisPeriod", type: "money", width: 18 },
        { key: "previous", label: "reports.colPrevious", type: "money", width: 18 },
        { key: "change", label: "reports.colChange", type: "percent", width: 10 },
      ],
      rows,
    };
  },
};

export const bsDataset: Dataset<Workspace> = {
  id: "bs",
  permissions: ["finance.view"],
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const p = periodOf(ws, params);
    const bs = await balanceSheet(db, ws.org.id, p.to);
    const line = (a: AccountBalance): Row => ({ id: a.id, href: `reports/ledger?account=${a.id}&to=${p.toKey}`, cells: { account: `${a.code} · ${pick(locale, a.name, a.nameAr)}`, amount: a.balance } });
    const fmt = createFormatter({ locale, digits: "latn" });
    return {
      title: t("reports.bs"),
      subtitle: t("reports.asOf", { date: fmt.date(new Date(p.to.getTime() - DAY)) }),
      columns: [
        { key: "account", label: "reports.colAccount", type: "text", width: 44 },
        { key: "amount", label: "docs.colAmount", type: "money", width: 20 },
      ],
      rows: [
        heading("h-assets", t("reports.assets")),
        ...bs.assets.map(line),
        { id: "t-assets", cells: { account: t("reports.totalAssets"), amount: bs.totalAssets }, emphasis: "total" },
        heading("h-liab", t("reports.liabilities")),
        ...bs.liabilities.map(line),
        { id: "s-liab", cells: { account: t("reports.totalLiabilities"), amount: bs.totalLiabilities }, emphasis: "subtotal" },
        heading("h-eq", t("reports.equity")),
        ...bs.equity.map(line),
        { id: "earnings", cells: { account: t("reports.currentEarnings"), amount: bs.currentEarnings } },
        { id: "s-eq", cells: { account: t("reports.totalEquity"), amount: bs.totalEquity }, emphasis: "subtotal" },
        { id: "t-le", cells: { account: t("reports.totalLiabilitiesEquity"), amount: bs.totalLiabilities + bs.totalEquity }, emphasis: "total" },
      ],
    };
  },
};

export const cfDataset: Dataset<Workspace> = {
  id: "cf",
  permissions: ["finance.view"],
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const p = periodOf(ws, params);
    const cf = await cashFlow(db, ws.org.id, p.from, p.to, ws.org.timezone);
    const r = (id: string, label: MessageKey, amount: number, emphasis?: Row["emphasis"]): Row => ({ id, cells: { line: t(label), amount }, emphasis });
    return {
      title: t("reports.cf"),
      subtitle: periodLabel(locale, p),
      columns: [
        { key: "line", label: "reports.colLine", type: "text", width: 44 },
        { key: "amount", label: "docs.colAmount", type: "money", width: 20 },
      ],
      rows: [
        r("open", "reports.openingCash", cf.opening, "subtotal"),
        { id: "h-op", cells: { line: t("reports.operating") }, emphasis: "heading" },
        r("customers", "reports.cfCustomers", cf.lines.customers),
        r("suppliers", "reports.cfSuppliers", cf.lines.suppliers),
        r("salaries", "reports.cfSalaries", cf.lines.salaries),
        r("claims", "reports.cfClaims", cf.lines.claims),
        r("other", "reports.cfOther", cf.lines.otherOperating),
        r("s-op", "reports.netOperating", cf.operating, "subtotal"),
        { id: "h-inv", cells: { line: t("reports.investing") }, emphasis: "heading" },
        r("investing", "reports.cfAssets", cf.investing),
        { id: "h-fin", cells: { line: t("reports.financing") }, emphasis: "heading" },
        r("financing", "reports.cfOwners", cf.financing),
        r("net", "reports.netChange", cf.net, "subtotal"),
        r("close", "reports.closingCash", cf.closing, "total"),
      ],
    };
  },
};

export const tbDataset: Dataset<Workspace> = {
  id: "tb",
  permissions: ["finance.view"],
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const p = periodOf(ws, params);
    const rows = (await accountBalances(db, ws.org.id, { to: p.to })).filter((a) => a.debit || a.credit);
    const fmt = createFormatter({ locale, digits: "latn" });
    return {
      title: t("reports.tb"),
      subtitle: t("reports.asOf", { date: fmt.date(new Date(p.to.getTime() - DAY)) }),
      columns: [
        { key: "code", label: "reports.colCode", type: "text", width: 9 },
        { key: "account", label: "reports.colAccount", type: "text", width: 36 },
        { key: "debit", label: "reports.colDebit", type: "money", total: true, width: 17 },
        { key: "credit", label: "reports.colCredit", type: "money", total: true, width: 17 },
      ],
      rows: rows.map((a) => {
        const net = a.debit - a.credit;
        return { id: a.id, href: `reports/ledger?account=${a.id}&to=${p.toKey}`, cells: { code: a.code, account: pick(locale, a.name, a.nameAr), debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 } };
      }),
    };
  },
};

function agingDataset(id: string, kind: "invoice" | "bill"): Dataset<Workspace> {
  return {
    id,
    permissions: ["finance.view"],
    async load(ws, params, { locale, t }): Promise<DatasetResult> {
      const p = periodOf(ws, params);
      const rows = await aging(db, ws.org.id, kind, new Date(p.to.getTime() - 1));
      const fmt = createFormatter({ locale, digits: "latn" });
      return {
        title: t(kind === "invoice" ? "reports.arAging" : "reports.apAging"),
        subtitle: t("reports.asOf", { date: fmt.date(new Date(p.to.getTime() - DAY)) }),
        columns: [
          { key: "party", label: kind === "invoice" ? "docs.colCustomer" : "docs.colSupplier", type: "text", width: 30 },
          { key: "current", label: "reports.notDue", type: "money", total: true, width: 14 },
          { key: "d1_30", label: "reports.d1_30", type: "money", total: true, width: 13 },
          { key: "d31_60", label: "reports.d31_60", type: "money", total: true, width: 13 },
          { key: "d61_90", label: "reports.d61_90", type: "money", total: true, width: 13 },
          { key: "d90", label: "reports.d90", type: "money", total: true, width: 13 },
          { key: "total", label: "docs.colTotal", type: "money", total: true, width: 15 },
        ],
        rows: rows.map((r) => ({
          id: r.partyId,
          href: `${kind === "invoice" ? "sales/customers" : "purchases/suppliers"}/${r.partyId}`,
          cells: { party: pick(locale, r.name, r.nameAr), ...r.buckets, total: r.total },
        })),
      };
    },
  };
}

export const arAgingDataset = agingDataset("ar-aging", "invoice");
export const apAgingDataset = agingDataset("ap-aging", "bill");

export const salesByCustomerDataset: Dataset<Workspace> = {
  id: "sales-by-customer",
  permissions: ["finance.view"],
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const p = periodOf(ws, params);
    const docs = await db.document.groupBy({ by: ["partyId"], where: { orgId: ws.org.id, kind: "invoice", status: { in: ["issued", "partial", "paid"] }, date: { gte: p.from, lt: p.to } }, _sum: { total: true, paid: true }, _count: { _all: true } });
    const parties = new Map((await db.party.findMany({ where: { id: { in: docs.map((d) => d.partyId) } } })).map((x) => [x.id, x]));
    const grand = docs.reduce((s, d) => s + (d._sum.total ?? 0), 0);
    return {
      title: t("reports.salesByCustomer"),
      subtitle: periodLabel(locale, p),
      columns: [
        { key: "party", label: "docs.colCustomer", type: "text", width: 32 },
        { key: "count", label: "reports.colInvoices", type: "number", total: true, width: 10 },
        { key: "sales", label: "reports.colSales", type: "money", total: true, width: 16 },
        { key: "open", label: "parties.colReceivable", type: "money", total: true, width: 16 },
        { key: "share", label: "reports.colShare", type: "percent", width: 10 },
      ],
      rows: docs
        .sort((a, b) => (b._sum.total ?? 0) - (a._sum.total ?? 0))
        .map((d) => {
          const party = parties.get(d.partyId)!;
          return { id: d.partyId, href: `sales/customers/${d.partyId}`, cells: { party: pick(locale, party.name, party.nameAr), count: d._count._all, sales: d._sum.total ?? 0, open: (d._sum.total ?? 0) - (d._sum.paid ?? 0), share: grand ? (d._sum.total ?? 0) / grand : 0 } };
        }),
    };
  },
};

export const salesByItemDataset: Dataset<Workspace> = {
  id: "sales-by-item",
  permissions: ["finance.view"],
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const p = periodOf(ws, params);
    const lines = await db.documentLine.groupBy({ by: ["itemId"], where: { orgId: ws.org.id, itemId: { not: null }, document: { kind: "invoice", status: { in: ["issued", "partial", "paid"] }, date: { gte: p.from, lt: p.to } } }, _sum: { qty: true, amount: true } });
    const moves = await db.stockMove.findMany({ where: { orgId: ws.org.id, kind: "sale", date: { gte: p.from, lt: p.to } }, select: { itemId: true, qty: true, unitCost: true } });
    const cost = new Map<string, number>();
    for (const m of moves) cost.set(m.itemId, (cost.get(m.itemId) ?? 0) + stockValue(-m.qty, m.unitCost));
    const items = new Map((await db.item.findMany({ where: { orgId: ws.org.id } })).map((i) => [i.id, i]));
    return {
      title: t("reports.salesByItem"),
      subtitle: periodLabel(locale, p),
      columns: [
        { key: "sku", label: "items.colSku", type: "text", width: 14 },
        { key: "item", label: "items.colName", type: "text", width: 32 },
        { key: "qty", label: "docs.colQty", type: "number", width: 10 },
        { key: "revenue", label: "reports.colSales", type: "money", total: true, width: 15 },
        { key: "cost", label: "reports.colCost", type: "money", total: true, width: 15 },
        { key: "profit", label: "reports.colProfit", type: "money", total: true, width: 15 },
        { key: "margin", label: "reports.colMargin", type: "percent", width: 10 },
      ],
      rows: lines
        .filter((l) => l.itemId)
        .sort((a, b) => (b._sum.amount ?? 0) - (a._sum.amount ?? 0))
        .map((l) => {
          const it = items.get(l.itemId!)!;
          const revenue = l._sum.amount ?? 0;
          const c = cost.get(l.itemId!) ?? 0;
          return { id: it.id, href: `inventory/items/${it.id}`, cells: { sku: it.sku, item: pick(locale, it.name, it.nameAr), qty: (l._sum.qty ?? 0) / 100, revenue, cost: c, profit: revenue - c, margin: revenue ? (revenue - c) / revenue : null } };
        }),
    };
  },
};

export const stockValuationDataset: Dataset<Workspace> = {
  id: "stock-valuation",
  permissions: ["finance.view"],
  async load(ws, _params, { locale, t }): Promise<DatasetResult> {
    const items = await db.item.findMany({ where: { orgId: ws.org.id, kind: "product" }, include: { levels: true }, orderBy: [{ category: "asc" }, { name: "asc" }] });
    return {
      title: t("reports.stockValuation"),
      subtitle: t("reports.atAverageCost"),
      columns: [
        { key: "sku", label: "items.colSku", type: "text", width: 14 },
        { key: "item", label: "items.colName", type: "text", width: 32 },
        { key: "category", label: "items.colCategory", type: "text", width: 18 },
        { key: "qty", label: "items.colOnHand", type: "number", width: 10 },
        { key: "cost", label: "items.colCost", type: "money", width: 13 },
        { key: "value", label: "items.colValue", type: "money", total: true, width: 15 },
      ],
      rows: items
        .map((i) => {
          const qty = i.levels.reduce((s, l) => s + l.qty, 0);
          return { id: i.id, href: `inventory/items/${i.id}`, cells: { sku: i.sku, item: pick(locale, i.name, i.nameAr), category: i.category, qty: qty / 100, cost: i.avgCost, value: stockValue(qty, i.avgCost) } };
        })
        .filter((r) => r.cells.qty !== 0),
    };
  },
};

/** Every line on one account with a running balance. */
export const ledgerDataset: Dataset<Workspace> = {
  id: "ledger",
  permissions: ["finance.view"],
  async load(ws, params, { locale, t }): Promise<DatasetResult> {
    const p = periodOf(ws, params);
    const fromKey = params.get("from") ? p.fromKey : null;
    const account = await db.account.findFirst({ where: { id: params.get("account") ?? "", orgId: ws.org.id } });
    const columns: Column[] = [
      { key: "date", label: "docs.colDate", type: "date", width: 13 },
      { key: "entry", label: "reports.colEntry", type: "text", width: 15 },
      { key: "memo", label: "reports.colMemo", type: "text", width: 40 },
      { key: "debit", label: "reports.colDebit", type: "money", total: true, width: 15 },
      { key: "credit", label: "reports.colCredit", type: "money", total: true, width: 15 },
      { key: "balance", label: "docs.colBalance", type: "money", width: 16 },
    ];
    if (!account) return { title: t("reports.ledger"), columns, rows: [] };
    const debitNormal = account.type === "asset" || account.type === "expense";
    const sign = (d: number, c: number) => (debitNormal ? d - c : c - d);
    const opening = fromKey ? await db.journalLine.aggregate({ where: { accountId: account.id, date: { lt: p.from } }, _sum: { debit: true, credit: true } }) : null;
    let bal = opening ? sign(opening._sum.debit ?? 0, opening._sum.credit ?? 0) : 0;
    const lines = await db.journalLine.findMany({ where: { accountId: account.id, date: { ...(fromKey ? { gte: p.from } : {}), lt: p.to } }, orderBy: [{ date: "asc" }, { id: "asc" }], include: { entry: { select: { id: true, number: true, memo: true } } }, take: 5000 });
    const rows: Row[] = [];
    if (opening) rows.push({ id: "opening", cells: { date: p.from.toISOString(), memo: t("reports.openingBalance"), balance: bal }, emphasis: "subtotal" });
    for (const l of lines) {
      bal += sign(l.debit, l.credit);
      rows.push({ id: l.id, href: `finance/journals/${l.entry.id}`, cells: { date: l.date.toISOString(), entry: l.entry.number, memo: l.memo ?? l.entry.memo ?? "", debit: l.debit, credit: l.credit, balance: bal } });
    }
    return { title: `${account.code} · ${pick(locale, account.name, account.nameAr)}`, subtitle: fromKey ? periodLabel(locale, p) : t("reports.asOf", { date: createFormatter({ locale, digits: "latn" }).date(new Date(p.to.getTime() - DAY)) }), columns, rows };
  },
};

/** Chart of accounts with current balances, grouped by type. */
export const accountsDataset: Dataset<Workspace> = {
  id: "accounts",
  permissions: ["finance.view"],
  async load(ws, _params, { locale, t }): Promise<DatasetResult> {
    const rows = await accountBalances(db, ws.org.id, {});
    const groups: [string, MessageKey][] = [
      ["asset", "reports.assets"],
      ["liability", "reports.liabilities"],
      ["equity", "reports.equity"],
      ["income", "reports.income"],
      ["cogs", "reports.costOfSales"],
      ["expense", "reports.operatingExpenses"],
    ];
    const out: Row[] = [];
    for (const [g, label] of groups) {
      const list = rows.filter((r) => r.group === g);
      if (!list.length) continue;
      out.push({ id: `h-${g}`, cells: { code: "", account: t(label) }, emphasis: "heading" });
      for (const a of list) out.push({ id: a.id, href: `reports/ledger?account=${a.id}`, cells: { code: a.code, account: pick(locale, a.name, a.nameAr), role: a.role ? t("accounts.system") : "", balance: a.balance }, meta: { system: !!a.role } });
    }
    return {
      title: t("nav.accounts"),
      columns: [
        { key: "code", label: "reports.colCode", type: "text", width: 9 },
        { key: "account", label: "reports.colAccount", type: "text", width: 38 },
        { key: "role", label: "accounts.colUse", type: "text", width: 14 },
        { key: "balance", label: "docs.colBalance", type: "money", width: 17 },
      ],
      rows: out,
    };
  },
};

const SOURCES: Record<string, MessageKey> = {
  manual: "journals.src_manual",
  opening: "journals.src_opening",
  invoice: "journals.src_invoice",
  payment: "journals.src_payment",
  bill: "journals.src_bill",
  receipt: "journals.src_receipt",
  stock: "journals.src_stock",
  claim: "journals.src_claim",
  payroll: "journals.src_payroll",
};

/** Journal entries, newest first. */
export const journalsDataset: Dataset<Workspace> = {
  id: "journals",
  permissions: ["finance.view"],
  async load(ws, params, { t }): Promise<DatasetResult> {
    const p = periodOf(ws, params);
    const q = params.get("q")?.trim();
    const entries = await db.journalEntry.findMany({
      where: { orgId: ws.org.id, date: { gte: p.from, lt: p.to }, ...(params.get("source") ? { sourceType: params.get("source")! } : {}), ...(q ? { OR: [{ number: { contains: q.toUpperCase() } }, { memo: { contains: q } }] } : {}) },
      orderBy: [{ date: "desc" }, { number: "desc" }],
      include: { lines: { select: { debit: true } } },
      take: 3000,
    });
    return {
      title: t("nav.journals"),
      subtitle: periodLabel(ws.viewer.prefs.locale, p),
      columns: [
        { key: "number", label: "reports.colEntry", type: "text", width: 15 },
        { key: "date", label: "docs.colDate", type: "date", width: 13 },
        { key: "source", label: "journals.colSource", type: "enum", options: SOURCES, width: 16 },
        { key: "memo", label: "reports.colMemo", type: "text", width: 44 },
        { key: "amount", label: "docs.colAmount", type: "money", width: 16 },
      ],
      rows: entries.map((e) => ({
        id: e.id,
        href: `finance/journals/${e.id}`,
        cells: { number: e.number, date: e.date.toISOString(), source: e.sourceType, memo: e.memo ?? "", amount: e.lines.reduce((s, l) => s + l.debit, 0) },
        meta: { reversed: !!e.reversedAt || !!e.reversesId },
      })),
    };
  },
};

export const REPORTS = ["pl", "bs", "cf", "tb", "ar-aging", "ap-aging", "sales-by-customer", "sales-by-item", "stock-valuation", "ledger"] as const;
export type ReportId = (typeof REPORTS)[number];
export const REPORT_DATASETS: Record<ReportId, Dataset<Workspace>> = {
  pl: plDataset,
  bs: bsDataset,
  cf: cfDataset,
  tb: tbDataset,
  "ar-aging": arAgingDataset,
  "ap-aging": apAgingDataset,
  "sales-by-customer": salesByCustomerDataset,
  "sales-by-item": salesByItemDataset,
  "stock-valuation": stockValuationDataset,
  ledger: ledgerDataset,
};
