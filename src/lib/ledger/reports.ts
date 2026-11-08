// Financial statements, computed from journal lines only. Amounts are dirhams,
// shown with their natural sign (income and liabilities positive).

import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { accountGroup, isDebitNormal } from "./chart";
import { agingBucket, type AgingBucket } from "../docs/math";

type Db = PrismaClient | Prisma.TransactionClient;

export interface AccountBalance {
  id: string;
  code: string;
  name: string;
  nameAr: string | null;
  type: string;
  role: string | null;
  group: ReturnType<typeof accountGroup>;
  debit: number;
  credit: number;
  /** In the account's natural direction (assets/expenses: debit − credit) */
  balance: number;
}

/** Debit/credit totals per account for lines dated in [from, to). */
export async function accountBalances(db: Db, orgId: string, range: { from?: Date; to?: Date }): Promise<AccountBalance[]> {
  const [accounts, sums] = await Promise.all([
    db.account.findMany({ where: { orgId }, orderBy: { code: "asc" } }),
    db.journalLine.groupBy({
      by: ["accountId"],
      where: { orgId, date: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lt: range.to } : {}) } },
      _sum: { debit: true, credit: true },
    }),
  ]);
  const byId = new Map(sums.map((s) => [s.accountId, s._sum]));
  return accounts.map((a) => {
    const s = byId.get(a.id);
    const debit = s?.debit ?? 0;
    const credit = s?.credit ?? 0;
    return { id: a.id, code: a.code, name: a.name, nameAr: a.nameAr, type: a.type, role: a.role, group: accountGroup(a.code, a.type), debit, credit, balance: isDebitNormal(a.type) ? debit - credit : credit - debit };
  });
}

export interface ProfitAndLoss {
  income: AccountBalance[];
  cogs: AccountBalance[];
  expenses: AccountBalance[];
  totalIncome: number;
  totalCogs: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
}

export async function profitAndLoss(db: Db, orgId: string, from: Date, to: Date): Promise<ProfitAndLoss> {
  const rows = (await accountBalances(db, orgId, { from, to })).filter((r) => r.debit || r.credit);
  const income = rows.filter((r) => r.group === "income");
  const cogs = rows.filter((r) => r.group === "cogs");
  const expenses = rows.filter((r) => r.group === "expense");
  const sum = (xs: AccountBalance[]) => xs.reduce((s, r) => s + r.balance, 0);
  const totalIncome = sum(income);
  const totalCogs = sum(cogs);
  const totalExpenses = sum(expenses);
  return { income, cogs, expenses, totalIncome, totalCogs, grossProfit: totalIncome - totalCogs, totalExpenses, netProfit: totalIncome - totalCogs - totalExpenses };
}

export interface BalanceSheet {
  assets: AccountBalance[];
  liabilities: AccountBalance[];
  equity: AccountBalance[];
  /** Profit not yet closed into retained earnings */
  currentEarnings: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

export async function balanceSheet(db: Db, orgId: string, asOf: Date): Promise<BalanceSheet> {
  const rows = await accountBalances(db, orgId, { to: asOf });
  const pick = (g: string) => rows.filter((r) => r.group === g && (r.debit || r.credit));
  const assets = pick("asset");
  const liabilities = pick("liability");
  const equity = pick("equity");
  const income = rows.filter((r) => r.group === "income").reduce((s, r) => s + r.balance, 0);
  const costs = rows.filter((r) => r.group === "cogs" || r.group === "expense").reduce((s, r) => s + r.balance, 0);
  const currentEarnings = income - costs;
  const sum = (xs: AccountBalance[]) => xs.reduce((s, r) => s + r.balance, 0);
  return { assets, liabilities, equity, currentEarnings, totalAssets: sum(assets), totalLiabilities: sum(liabilities), totalEquity: sum(equity) + currentEarnings };
}

export type CashFlowLine = "customers" | "suppliers" | "salaries" | "claims" | "otherOperating" | "investing" | "financing";

export interface CashFlow {
  opening: number;
  closing: number;
  lines: Record<CashFlowLine, number>;
  operating: number;
  investing: number;
  financing: number;
  net: number;
  /** Net cash movement per month, for the chart */
  months: { month: string; inflow: number; outflow: number }[];
}

/**
 * Direct-method cash flow: every movement on cash and bank accounts, grouped
 * by what caused it (the journal entry's source and its other accounts).
 */
export async function cashFlow(db: Db, orgId: string, from: Date, to: Date, timeZone = "Asia/Qatar"): Promise<CashFlow> {
  const cashIds = (await db.account.findMany({ where: { orgId, role: { in: ["cash", "bank"] } }, select: { id: true } })).map((a) => a.id);
  const before = await db.journalLine.aggregate({ where: { orgId, accountId: { in: cashIds }, date: { lt: from } }, _sum: { debit: true, credit: true } });
  const opening = (before._sum.debit ?? 0) - (before._sum.credit ?? 0);
  const cashLines = await db.journalLine.findMany({
    where: { orgId, accountId: { in: cashIds }, date: { gte: from, lt: to } },
    include: { entry: { include: { lines: { include: { account: true } } } } },
  });
  const lines: Record<CashFlowLine, number> = { customers: 0, suppliers: 0, salaries: 0, claims: 0, otherOperating: 0, investing: 0, financing: 0 };
  const monthly = new Map<string, { inflow: number; outflow: number }>();
  const monthOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).format(d);
  for (const l of cashLines) {
    const amount = l.debit - l.credit;
    const others = l.entry.lines.filter((o) => !cashIds.includes(o.accountId));
    const roles = new Set(others.map((o) => o.account.role));
    let bucket: CashFlowLine = "otherOperating";
    if (roles.has("receivable")) bucket = "customers";
    else if (roles.has("payable")) bucket = "suppliers";
    else if (roles.has("salariesPayable") || l.entry.sourceType === "payroll") bucket = "salaries";
    else if (roles.has("reimbursements") || l.entry.sourceType === "claim") bucket = "claims";
    else if (others.some((o) => o.account.type === "equity")) bucket = "financing";
    else if (others.some((o) => o.account.type === "asset" && o.account.code.startsWith("15"))) bucket = "investing";
    lines[bucket] += amount;
    const m = monthOf(l.date);
    const cur = monthly.get(m) ?? { inflow: 0, outflow: 0 };
    if (amount > 0) cur.inflow += amount;
    else cur.outflow -= amount;
    monthly.set(m, cur);
  }
  const operating = lines.customers + lines.suppliers + lines.salaries + lines.claims + lines.otherOperating;
  const net = operating + lines.investing + lines.financing;
  return {
    opening,
    closing: opening + net,
    lines,
    operating,
    investing: lines.investing,
    financing: lines.financing,
    net,
    months: [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v })),
  };
}

export interface AgingRow {
  partyId: string;
  name: string;
  nameAr: string | null;
  buckets: Record<AgingBucket, number>;
  total: number;
  documents: number;
}

/** Open invoices (receivables) or bills (payables) by how overdue they are. */
export async function aging(db: Db, orgId: string, kind: "invoice" | "bill", asOf: Date): Promise<AgingRow[]> {
  const docs = await db.document.findMany({
    // School fee invoices are receivables too.
    where: { orgId, kind: kind === "invoice" ? { in: ["invoice", "fee"] } : "bill", status: { in: kind === "invoice" ? ["issued", "partial"] : ["posted", "partial"] }, date: { lte: asOf } },
    include: { party: { select: { id: true, name: true, nameAr: true } } },
  });
  const rows = new Map<string, AgingRow>();
  for (const d of docs) {
    const open = d.total - d.paid;
    if (open <= 0) continue;
    const r = rows.get(d.partyId) ?? { partyId: d.partyId, name: d.party.name, nameAr: d.party.nameAr, buckets: { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 }, total: 0, documents: 0 };
    r.buckets[agingBucket(d.dueDate ?? d.date, asOf)] += open;
    r.total += open;
    r.documents++;
    rows.set(d.partyId, r);
  }
  return [...rows.values()].sort((a, b) => b.total - a.total);
}

/** Balance of one account (natural sign), optionally up to a date. */
export async function balanceOf(db: Db, orgId: string, accountIds: string[], to?: Date) {
  const r = await db.journalLine.aggregate({ where: { orgId, accountId: { in: accountIds }, ...(to ? { date: { lt: to } } : {}) }, _sum: { debit: true, credit: true } });
  return (r._sum.debit ?? 0) - (r._sum.credit ?? 0);
}
