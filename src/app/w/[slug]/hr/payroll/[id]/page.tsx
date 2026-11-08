import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { bizPage, bizSettings, i18nFor } from "@/lib/biz";
import { addMonths } from "@/lib/format";
import { payslipsDataset } from "@/lib/datasets/hr";
import { sifForRun } from "@/lib/payroll/ops";
import { PayrollRun } from "@/components/business/payroll-views";

export const metadata: Metadata = { title: "Payroll" };

export default async function PayrollRunPage({ params }: PageProps<"/w/[slug]/hr/payroll/[id]">) {
  const { slug, id } = await params;
  const ws = await bizPage(slug, ["payroll.run", "hr.manage"], ["business", "school"]);
  await connection();
  const run = await db.payrollRun.findFirst({ where: { id, orgId: ws.org.id }, include: { payslips: { include: { employee: true }, orderBy: { employee: { number: "asc" } } } } });
  if (!run) notFound();
  const { locale, t } = await i18nFor(ws);
  const query = new URLSearchParams({ run: id });
  const p = bizSettings(ws.org).payroll ?? {};
  const wpsReady = !!(p.employerEid && p.bankShortName && p.iban);
  const [result, prev, approver, sif] = await Promise.all([
    payslipsDataset.load(ws, query, { locale, t }),
    db.payrollRun.findUnique({ where: { orgId_month: { orgId: ws.org.id, month: addMonths(run.month, -1) } } }),
    run.approvedById ? db.user.findUnique({ where: { id: run.approvedById }, select: { name: true, nameAr: true } }) : null,
    wpsReady ? sifForRun(db, ws.org.id, id, { employerEid: p.employerEid!, payerEid: p.payerEid ?? null, bankShortName: p.bankShortName!, iban: p.iban! }) : null,
  ]);
  return (
    <PayrollRun
      slug={slug}
      run={{
        id: run.id,
        month: run.month,
        status: run.status,
        people: run.payslips.length,
        gross: run.totalGross,
        deductions: run.totalDeductions,
        net: run.totalNet,
        paidAt: run.paidAt?.toISOString() ?? null,
        approvedBy: approver ? (locale === "ar" ? (approver.nameAr ?? approver.name) : approver.name) : null,
        approvedAt: run.approvedAt?.toISOString() ?? null,
      }}
      slips={run.payslips.map((s) => ({
        id: s.id,
        employeeId: s.employeeId,
        name: s.employee.name,
        nameAr: s.employee.nameAr,
        number: s.employee.number,
        payMethod: s.employee.payMethod,
        workingDays: s.workingDays,
        absentDays: s.absentDays,
        unpaidLeaveDays: s.unpaidLeaveDays,
        basic: s.basic,
        allowances: s.housing + s.transport + s.food + s.other,
        overtimeHours: s.overtimeHours,
        overtimePay: s.overtimePay,
        bonus: s.bonus,
        absenceDeduction: s.absenceDeduction,
        advanceDeduction: s.advanceDeduction,
        otherDeduction: s.otherDeduction,
        gross: s.gross,
        deductions: s.deductions,
        net: s.net,
        notes: s.notes,
      }))}
      issues={sif?.issues ?? []}
      cashPaid={sif?.cashPaid ?? run.payslips.filter((s) => s.employee.payMethod !== "bank").map((s) => s.employee.name)}
      wpsReady={wpsReady}
      query={query.toString()}
      result={result}
      canShare={ws.can("exports.share")}
      canApprove={ws.can("hr.manage")}
      previousNet={prev?.totalNet ?? null}
    />
  );
}
