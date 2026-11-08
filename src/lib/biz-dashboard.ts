import "server-only";
import { db } from "./db";
import type { Workspace } from "./auth/dal";
import { addMonths, monthKey, monthStart } from "./format";
import { balanceOf, cashFlow, profitAndLoss } from "./ledger/reports";
import { leaveBalance, ymdOf } from "./hr/ops";

const DAY = 86400_000;

export type BriefKind = "overdue" | "stock" | "doc" | "payroll" | "approve" | "received" | "leave" | "good";

export interface BizDashboardData {
  finance: {
    revenue: number;
    revenueLast: number;
    grossMargin: number | null;
    netProfit: number;
    cash: number;
    receivable: number;
    overdue: number;
    overdueCount: number;
    payableSoon: number;
    sales: { month: string; total: number }[];
    cashMonths: { month: string; inflow: number; outflow: number }[];
    topCustomers: { id: string; name: string; nameAr: string | null; total: number }[];
  } | null;
  lowStock: { id: string; sku: string; name: string; nameAr: string | null; qty: number; reorder: number; unit: string }[] | null;
  waiting: { key: string; count: number; amount?: number; href: string }[];
  expiring: { id: string; name: string; nameAr: string | null; doc: "qid" | "passport"; date: string }[] | null;
  payroll: { month: string; status: string | null; net: number } | null;
  me: { employeeId: string; checkIn: string | null; checkOut: string | null; leaveLeft: number; lastPayslip: { month: string; net: number } | null } | null;
  brief: { kind: BriefKind; vars: Record<string, string | number>; href?: string }[];
}

export async function getBizDashboard(ws: Workspace, now = new Date()): Promise<BizDashboardData> {
  const orgId = ws.org.id;
  const tz = ws.org.timezone;
  const month = monthKey(now, tz);
  const mStart = monthStart(month);
  const lastStart = monthStart(addMonths(month, -1));
  const fin = ws.can("finance.view");
  const brief: BizDashboardData["brief"] = [];

  let finance: BizDashboardData["finance"] = null;
  if (fin) {
    const cashIds = (await db.account.findMany({ where: { orgId, role: { in: ["cash", "bank"] } }, select: { id: true } })).map((a) => a.id);
    const yearStart = monthStart(addMonths(month, -11));
    const [plNow, plLast, plYear, cash, open, overdueDocs, payable, salesDocs, cf, top] = await Promise.all([
      profitAndLoss(db, orgId, mStart, now),
      // Month to date against the same number of days last month.
      profitAndLoss(db, orgId, lastStart, new Date(Math.min(mStart.getTime(), lastStart.getTime() + (now.getTime() - mStart.getTime())))),
      profitAndLoss(db, orgId, yearStart, now),
      balanceOf(db, orgId, cashIds),
      db.document.aggregate({ where: { orgId, kind: "invoice", status: { in: ["issued", "partial"] } }, _sum: { total: true, paid: true } }),
      db.document.findMany({ where: { orgId, kind: "invoice", status: { in: ["issued", "partial"] }, dueDate: { lt: now } }, select: { total: true, paid: true, dueDate: true } }),
      db.document.aggregate({ where: { orgId, kind: "bill", status: { in: ["posted", "partial"] }, dueDate: { lt: new Date(now.getTime() + 7 * DAY) } }, _sum: { total: true, paid: true } }),
      db.document.findMany({ where: { orgId, kind: "invoice", status: { in: ["issued", "partial", "paid"] }, date: { gte: yearStart } }, select: { date: true, total: true } }),
      cashFlow(db, orgId, yearStart, now, tz),
      db.document.groupBy({ by: ["partyId"], where: { orgId, kind: "invoice", status: { in: ["issued", "partial", "paid"] }, date: { gte: yearStart } }, _sum: { total: true }, orderBy: { _sum: { total: "desc" } }, take: 5 }),
    ]);
    const months = Array.from({ length: 12 }, (_, i) => addMonths(month, i - 11));
    const byMonth = new Map(months.map((m) => [m, 0]));
    for (const d of salesDocs) byMonth.set(monthKey(d.date, tz), (byMonth.get(monthKey(d.date, tz)) ?? 0) + d.total);
    const parties = new Map((await db.party.findMany({ where: { id: { in: top.map((t) => t.partyId) } } })).map((p) => [p.id, p]));
    const overdue = overdueDocs.reduce((s, d) => s + d.total - d.paid, 0);
    finance = {
      revenue: plNow.totalIncome,
      revenueLast: plLast.totalIncome,
      grossMargin: plNow.totalIncome ? plNow.grossProfit / plNow.totalIncome : null,
      netProfit: plYear.netProfit,
      cash,
      receivable: (open._sum.total ?? 0) - (open._sum.paid ?? 0),
      overdue,
      overdueCount: overdueDocs.length,
      payableSoon: (payable._sum.total ?? 0) - (payable._sum.paid ?? 0),
      sales: months.map((m) => ({ month: m, total: byMonth.get(m) ?? 0 })),
      cashMonths: cf.months,
      topCustomers: top.map((t) => ({ id: t.partyId, name: parties.get(t.partyId)?.name ?? "", nameAr: parties.get(t.partyId)?.nameAr ?? null, total: t._sum.total ?? 0 })),
    };
    const week = overdueDocs.filter((d) => d.dueDate && d.dueDate > new Date(now.getTime() - 7 * DAY));
    if (overdueDocs.length) brief.push({ kind: "overdue", vars: { count: overdueDocs.length, amount: overdue, week: week.length }, href: "sales/invoices?status=overdue" });
    const yesterday = await db.payment.aggregate({ where: { orgId, direction: "in", voidedAt: null, date: { gte: new Date(now.getTime() - DAY) } }, _sum: { amount: true }, _count: { _all: true } });
    if (yesterday._count._all) brief.push({ kind: "received", vars: { amount: yesterday._sum.amount ?? 0, count: yesterday._count._all }, href: "sales/payments" });
  }

  let lowStock: BizDashboardData["lowStock"] = null;
  if (fin || ws.can("inventory.manage")) {
    const items = await db.item.findMany({ where: { orgId, kind: "product", archived: false, reorderLevel: { not: null } }, include: { levels: true } });
    lowStock = items
      .map((i) => ({ id: i.id, sku: i.sku, name: i.name, nameAr: i.nameAr, qty: i.levels.reduce((s, l) => s + l.qty, 0), reorder: i.reorderLevel!, unit: i.unit }))
      .filter((i) => i.qty <= i.reorder)
      .sort((a, b) => a.qty / Math.max(1, a.reorder) - b.qty / Math.max(1, b.reorder))
      .slice(0, 6);
    if (lowStock.length) brief.push({ kind: "stock", vars: { count: lowStock.length, first: lowStock[0].name, firstAr: lowStock[0].nameAr ?? lowStock[0].name }, href: "inventory/items?low=1" });
  }

  // Things waiting for this person.
  const waiting: BizDashboardData["waiting"] = [];
  const [claims, leave, drafts, toReceive, overdueBills] = await Promise.all([
    ws.can("claims.approve") ? db.claim.aggregate({ where: { orgId, status: "submitted", deletedAt: null, submittedById: { not: ws.viewer.id } }, _count: { _all: true }, _sum: { amount: true } }) : null,
    ws.can("leave.approve") || ws.can("hr.manage") ? db.leaveRequest.count({ where: { orgId, status: "submitted" } }) : null,
    ws.can("finance.manage") ? db.document.count({ where: { orgId, kind: "invoice", status: "draft" } }) : null,
    ws.can("inventory.manage") ? db.document.count({ where: { orgId, kind: "po", status: { in: ["sent", "partial"] } } }) : null,
    ws.can("finance.manage") ? db.document.aggregate({ where: { orgId, kind: "bill", status: { in: ["posted", "partial"] }, dueDate: { lt: now } }, _count: { _all: true }, _sum: { total: true, paid: true } }) : null,
  ]);
  if (claims?._count._all) waiting.push({ key: "claims", count: claims._count._all, amount: claims._sum.amount ?? 0, href: "claims?status=submitted" });
  if (leave) waiting.push({ key: "leave", count: leave, href: "hr/leave?status=submitted" });
  if (toReceive) waiting.push({ key: "receive", count: toReceive, href: "purchases/orders?status=sent" });
  if (drafts) waiting.push({ key: "drafts", count: drafts, href: "sales/invoices?status=draft" });
  if (overdueBills?._count._all) waiting.push({ key: "bills", count: overdueBills._count._all, amount: (overdueBills._sum.total ?? 0) - (overdueBills._sum.paid ?? 0), href: "purchases/bills?status=overdue" });
  const approvals = (claims?._count._all ?? 0) + (leave ?? 0);
  if (approvals) brief.push({ kind: "approve", vars: { count: approvals }, href: claims?._count._all ? "claims?status=submitted" : "hr/leave?status=submitted" });

  let expiring: BizDashboardData["expiring"] = null;
  let payroll: BizDashboardData["payroll"] = null;
  if (ws.can("hr.view")) {
    const soon = new Date(now.getTime() + 60 * DAY);
    const emps = await db.employee.findMany({ where: { orgId, status: "active", OR: [{ qidExpiry: { lte: soon } }, { passportExpiry: { lte: soon } }] } });
    expiring = emps
      .flatMap((e) => [
        ...(e.qidExpiry && e.qidExpiry <= soon ? [{ id: e.id, name: e.name, nameAr: e.nameAr, doc: "qid" as const, date: e.qidExpiry.toISOString() }] : []),
        ...(e.passportExpiry && e.passportExpiry <= soon ? [{ id: e.id, name: e.name, nameAr: e.nameAr, doc: "passport" as const, date: e.passportExpiry.toISOString() }] : []),
      ])
      .sort((a, b) => a.date.localeCompare(b.date));
    if (expiring[0]) {
      const days = Math.ceil((new Date(expiring[0].date).getTime() - now.getTime()) / DAY);
      brief.push({ kind: "doc", vars: { name: expiring[0].name, nameAr: expiring[0].nameAr ?? expiring[0].name, doc: expiring[0].doc, days }, href: `hr/employees/${expiring[0].id}` });
    }
  }
  if (ws.can("payroll.run") || ws.can("hr.manage")) {
    const run = await db.payrollRun.findUnique({ where: { orgId_month: { orgId, month } } });
    payroll = { month, status: run?.status ?? null, net: run?.totalNet ?? 0 };
    const dayOfMonth = Number(ymdOf(now).slice(8));
    if (!run && dayOfMonth >= 20) brief.push({ kind: "payroll", vars: { month }, href: "hr/payroll" });
  }

  let me: BizDashboardData["me"] = null;
  const emp = await db.employee.findFirst({ where: { orgId, userId: ws.viewer.id, status: "active" } });
  if (emp) {
    const [today, bal, slip] = await Promise.all([
      db.attendanceDay.findUnique({ where: { employeeId_date: { employeeId: emp.id, date: new Date(`${ymdOf(now)}T12:00:00+03:00`) } } }),
      leaveBalance(db, emp, now),
      db.payslip.findFirst({ where: { employeeId: emp.id, run: { status: { not: "draft" } } }, include: { run: true }, orderBy: { run: { month: "desc" } } }),
    ]);
    me = { employeeId: emp.id, checkIn: today?.checkIn ?? null, checkOut: today?.checkOut ?? null, leaveLeft: bal.remaining, lastPayslip: slip ? { month: slip.run.month, net: slip.net } : null };
    const upcoming = await db.leaveRequest.findFirst({ where: { employeeId: emp.id, status: "approved", startDate: { gte: now } }, orderBy: { startDate: "asc" } });
    if (upcoming) brief.push({ kind: "leave", vars: { date: upcoming.startDate.toISOString(), days: upcoming.days }, href: "hr/leave" });
  }

  if (!brief.length) brief.push({ kind: "good", vars: {} });
  return { finance, lowStock, waiting, expiring, payroll, me, brief };
}
