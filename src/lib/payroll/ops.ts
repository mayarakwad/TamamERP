// Payroll runs: build a month's payslips from employee records, attendance and
// leave; approve (books the salary cost); pay (bank and cash out); produce the
// WPS salary file. No server-only imports: the demo seed runs payroll too.

import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { postEntry, reverseSource } from "../ledger/post";
import { monthDays, dohaNoon, ymdOf } from "../hr/ops";
import { calcPayslip, type PayInput } from "./calc";
import { buildSif, type SifEmployer, type SifRecord } from "./wps";

type Db = PrismaClient | Prisma.TransactionClient;

export class PayrollError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

const DAY = 86400_000;

/** Unpaid days, absences and overtime for one employee in one month. */
async function monthFacts(db: Db, emp: { id: string; joinedOn: Date; leftOn: Date | null }, month: string) {
  const days = monthDays(month);
  const first = days[0];
  const last = days[days.length - 1];
  const [att, unpaid] = await Promise.all([
    db.attendanceDay.findMany({ where: { employeeId: emp.id, date: { gte: first, lte: last } }, select: { status: true, overtimeMin: true } }),
    db.leaveRequest.findMany({ where: { employeeId: emp.id, type: "unpaid", status: "approved", startDate: { lte: last }, endDate: { gte: first } }, select: { startDate: true, endDate: true, days: true } }),
  ]);
  const absent = att.filter((a) => a.status === "absent").length;
  const overtimeMin = att.reduce((s, a) => s + a.overtimeMin, 0);
  // Unpaid leave inside this month (working days, as approved).
  let unpaidDays = 0;
  for (const l of unpaid) {
    const span = Math.round((l.endDate.getTime() - l.startDate.getTime()) / DAY) + 1;
    const inMonth = days.filter((d) => d >= dohaNoon(ymdOf(l.startDate)) && d <= dohaNoon(ymdOf(l.endDate))).length;
    unpaidDays += Math.round((l.days * inMonth) / Math.max(1, span));
  }
  // Joined or left mid-month: the days outside employment are unpaid (on a 30-day basis).
  const notEmployed = days.filter((d) => d < dohaNoon(ymdOf(emp.joinedOn)) || (emp.leftOn && d > dohaNoon(ymdOf(emp.leftOn)))).length;
  const proRata = Math.round((notEmployed * 30) / days.length);
  return { absent, overtimeHours: Math.round(overtimeMin / 15) * 25, unpaidDays: unpaidDays + proRata };
}

function slipFields(emp: { basicSalary: number; housingAllowance: number; transportAllowance: number; foodAllowance: number; otherAllowance: number }, extra: Omit<PayInput, "basic" | "housing" | "transport" | "food" | "other">) {
  const input: PayInput = { basic: emp.basicSalary, housing: emp.housingAllowance, transport: emp.transportAllowance, food: emp.foodAllowance, other: emp.otherAllowance, ...extra };
  const r = calcPayslip(input);
  return {
    workingDays: r.workingDays,
    absentDays: input.absentDays,
    unpaidLeaveDays: input.unpaidLeaveDays,
    basic: input.basic,
    housing: input.housing,
    transport: input.transport,
    food: input.food,
    other: input.other,
    overtimeHours: input.overtimeHours,
    overtimePay: r.overtimePay,
    bonus: input.bonus,
    absenceDeduction: r.absenceDeduction,
    advanceDeduction: input.advanceDeduction,
    otherDeduction: input.otherDeduction,
    deductionCode: r.deductionCode,
    gross: r.gross,
    deductions: r.deductions,
    net: r.net,
  };
}

async function totals(db: Db, runId: string) {
  const s = await db.payslip.aggregate({ where: { runId }, _sum: { gross: true, deductions: true, net: true } });
  return db.payrollRun.update({ where: { id: runId }, data: { totalGross: s._sum.gross ?? 0, totalDeductions: s._sum.deductions ?? 0, totalNet: s._sum.net ?? 0 } });
}

/** Create (or refresh) the draft run for a month with a payslip per employee. */
export async function generateRun(db: Db, orgId: string, month: string, userId: string, extras: Record<string, { bonus?: number; advanceDeduction?: number; otherDeduction?: number; notes?: string }> = {}) {
  const days = monthDays(month);
  const existing = await db.payrollRun.findUnique({ where: { orgId_month: { orgId, month } } });
  if (existing && existing.status !== "draft") throw new PayrollError("payroll.notDraft");
  const run = existing ?? (await db.payrollRun.create({ data: { orgId, month, createdById: userId } }));
  const emps = await db.employee.findMany({
    where: { orgId, joinedOn: { lte: days[days.length - 1] }, OR: [{ status: "active" }, { leftOn: { gte: days[0] } }] },
    orderBy: { number: "asc" },
  });
  const kept = new Set<string>();
  for (const e of emps) {
    const facts = await monthFacts(db, e, month);
    const prev = await db.payslip.findUnique({ where: { runId_employeeId: { runId: run.id, employeeId: e.id } } });
    const x = extras[e.id] ?? {};
    // Manual figures already typed on a draft payslip survive a refresh.
    const fields = slipFields(e, {
      absentDays: facts.absent,
      unpaidLeaveDays: facts.unpaidDays,
      overtimeHours: facts.overtimeHours,
      bonus: x.bonus ?? prev?.bonus ?? 0,
      advanceDeduction: x.advanceDeduction ?? prev?.advanceDeduction ?? 0,
      otherDeduction: x.otherDeduction ?? prev?.otherDeduction ?? 0,
    });
    const notes = x.notes ?? prev?.notes ?? null;
    await db.payslip.upsert({
      where: { runId_employeeId: { runId: run.id, employeeId: e.id } },
      create: { orgId, runId: run.id, employeeId: e.id, ...fields, notes },
      update: { ...fields, notes },
    });
    kept.add(e.id);
  }
  await db.payslip.deleteMany({ where: { runId: run.id, employeeId: { notIn: [...kept] } } });
  return totals(db, run.id);
}

export interface SlipEdit {
  absentDays?: number;
  unpaidLeaveDays?: number;
  overtimeHours?: number;
  bonus?: number;
  advanceDeduction?: number;
  otherDeduction?: number;
  notes?: string | null;
}

/** Change a draft payslip's variable parts; everything else is recalculated. */
export async function updatePayslip(db: Db, orgId: string, slipId: string, edit: SlipEdit) {
  const slip = await db.payslip.findFirst({ where: { id: slipId, orgId }, include: { run: true, employee: true } });
  if (!slip) throw new PayrollError("empty.notFound");
  if (slip.run.status !== "draft") throw new PayrollError("payroll.notDraft");
  const fields = slipFields(
    { basicSalary: slip.basic, housingAllowance: slip.housing, transportAllowance: slip.transport, foodAllowance: slip.food, otherAllowance: slip.other },
    {
      absentDays: edit.absentDays ?? slip.absentDays,
      unpaidLeaveDays: edit.unpaidLeaveDays ?? slip.unpaidLeaveDays,
      overtimeHours: edit.overtimeHours ?? slip.overtimeHours,
      bonus: edit.bonus ?? slip.bonus,
      advanceDeduction: edit.advanceDeduction ?? slip.advanceDeduction,
      otherDeduction: edit.otherDeduction ?? slip.otherDeduction,
    },
  );
  if (fields.net < 0) throw new PayrollError("payroll.negativeNet");
  await db.payslip.update({ where: { id: slipId }, data: { ...fields, notes: edit.notes === undefined ? slip.notes : edit.notes } });
  return totals(db, slip.runId);
}

/** Approve: book salaries, allowances and deductions; the net becomes "salaries payable". */
export async function approveRun(db: Db, orgId: string, runId: string, userId: string, date?: Date) {
  const run = await db.payrollRun.findFirst({ where: { id: runId, orgId }, include: { payslips: true } });
  if (!run) throw new PayrollError("empty.notFound");
  if (run.status !== "draft") throw new PayrollError("payroll.notDraft");
  if (!run.payslips.length) throw new PayrollError("payroll.noPayslips");
  const slips = run.payslips;
  const sum = (f: (p: (typeof slips)[number]) => number) => slips.reduce((s, p) => s + f(p), 0);
  const days = monthDays(run.month);
  const at = date ?? days[days.length - 1];
  await postEntry(db, {
    orgId,
    date: at,
    memo: `Payroll ${run.month} (${run.payslips.length} people)`,
    sourceType: "payroll",
    sourceId: run.id,
    createdById: userId,
    lines: [
      { role: "salaries", debit: sum((p) => p.basic + p.overtimePay + p.bonus - p.absenceDeduction) },
      { role: "allowances", debit: sum((p) => p.housing + p.transport + p.food + p.other) },
      { role: "salariesPayable", credit: sum((p) => p.net) },
      { role: "advances", credit: sum((p) => p.advanceDeduction) },
      { role: "otherIncome", credit: sum((p) => p.otherDeduction) },
    ],
  });
  return db.payrollRun.update({ where: { id: runId }, data: { status: "approved", approvedById: userId, approvedAt: new Date() } });
}

/** Undo an approval that hasn't been paid yet. */
export async function reopenRun(db: Db, orgId: string, runId: string, userId: string) {
  const run = await db.payrollRun.findFirst({ where: { id: runId, orgId } });
  if (!run || run.status !== "approved") throw new PayrollError("payroll.notApproved");
  await reverseSource(db, { orgId, sourceType: "payroll", sourceId: runId, date: new Date(), createdById: userId, memo: `Payroll ${run.month} reopened` });
  return db.payrollRun.update({ where: { id: runId }, data: { status: "draft", approvedById: null, approvedAt: null } });
}

/** Salaries left the bank (WPS) and the cash box (cash-paid staff). */
export async function payRun(db: Db, orgId: string, runId: string, userId: string, payDate: Date) {
  const run = await db.payrollRun.findFirst({ where: { id: runId, orgId }, include: { payslips: { include: { employee: { select: { payMethod: true } } } } } });
  if (!run) throw new PayrollError("empty.notFound");
  if (run.status !== "approved") throw new PayrollError("payroll.notApproved");
  const bank = run.payslips.filter((p) => p.employee.payMethod === "bank").reduce((s, p) => s + p.net, 0);
  const cash = run.payslips.filter((p) => p.employee.payMethod !== "bank").reduce((s, p) => s + p.net, 0);
  await postEntry(db, {
    orgId,
    date: payDate,
    memo: `Salaries paid for ${run.month}`,
    sourceType: "payroll",
    sourceId: run.id,
    createdById: userId,
    lines: [{ role: "salariesPayable", debit: bank + cash }, { role: "bank", credit: bank }, { role: "cash", credit: cash }],
  });
  return db.payrollRun.update({ where: { id: runId }, data: { status: "paid", paidAt: payDate, payDate } });
}

/** The WPS file for a run: bank-paid staff only. */
export async function sifForRun(db: Db, orgId: string, runId: string, employer: SifEmployer, createdAt = new Date()) {
  const run = await db.payrollRun.findFirst({ where: { id: runId, orgId }, include: { payslips: { include: { employee: true }, orderBy: { employee: { number: "asc" } } } } });
  if (!run) throw new PayrollError("empty.notFound");
  const bankPaid = run.payslips.filter((p) => p.employee.payMethod === "bank");
  const records: SifRecord[] = bankPaid.map((p) => {
    const e = p.employee;
    const notes: string[] = [];
    if (p.absenceDeduction) notes.push(`Unpaid ${p.absentDays + p.unpaidLeaveDays} day(s)`);
    if (p.advanceDeduction) notes.push("Advance repayment");
    if (p.otherDeduction) notes.push(p.notes || "Other deduction");
    if (p.bonus) notes.push("Bonus");
    return {
      employeeName: e.name,
      qid: e.qid,
      visaId: e.qid ? null : e.visaNumber,
      bankShortName: e.bankShortName ?? "",
      account: e.iban ?? "",
      workingDays: p.workingDays,
      net: p.net,
      basic: p.basic,
      overtimeHours: p.overtimeHours,
      extraIncome: p.housing + p.transport + p.food + p.other + p.overtimePay + p.bonus,
      deductions: p.deductions,
      housing: p.housing,
      food: p.food,
      transport: p.transport,
      overtimePay: p.overtimePay,
      deductionCode: p.deductionCode,
      notes: notes.join("; ") || null,
    };
  });
  const cashPaid = run.payslips.filter((p) => p.employee.payMethod !== "bank").map((p) => p.employee.name);
  return { ...buildSif(employer, run.month, records, createdAt), cashPaid, run };
}
