import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { bizPage, bizSettings } from "@/lib/biz";
import { addMonths, monthKey } from "@/lib/format";
import { PayrollList } from "@/components/business/payroll-views";

export const metadata: Metadata = { title: "Payroll" };

export default async function PayrollPage({ params }: PageProps<"/w/[slug]/hr/payroll">) {
  const { slug } = await params;
  const ws = await bizPage(slug, ["payroll.run", "hr.manage"], ["business", "school"]);
  await connection();
  const [runs, emps] = await Promise.all([
    db.payrollRun.findMany({ where: { orgId: ws.org.id }, orderBy: { month: "desc" }, include: { _count: { select: { payslips: true } } } }),
    db.employee.findMany({ where: { orgId: ws.org.id, status: "active" }, select: { basicSalary: true, housingAllowance: true, transportAllowance: true, foodAllowance: true, otherAllowance: true } }),
  ]);
  // Next month to prepare: the current month if it has no run yet, else nothing (or the month after the latest).
  const current = monthKey(new Date(), ws.org.timezone);
  const months = new Set(runs.map((r) => r.month));
  const nextMonth = !months.has(current) ? current : !months.has(addMonths(current, 1)) && new Date().getUTCDate() >= 20 ? addMonths(current, 1) : null;
  const p = bizSettings(ws.org).payroll ?? {};
  return (
    <PayrollList
      slug={slug}
      runs={runs.map((r) => ({ id: r.id, month: r.month, status: r.status, people: r._count.payslips, gross: r.totalGross, deductions: r.totalDeductions, net: r.totalNet, paidAt: r.paidAt?.toISOString() ?? null }))}
      nextMonth={nextMonth}
      wps={{ employerEid: p.employerEid ?? "", payerEid: p.payerEid ?? "", bankShortName: p.bankShortName ?? "", iban: p.iban ?? "" }}
      canSetup={ws.can("workspace.manage") || ws.can("payroll.run")}
      people={emps.length}
      monthlyGross={emps.reduce((s, e) => s + e.basicSalary + e.housingAllowance + e.transportAllowance + e.foodAllowance + e.otherAllowance, 0)}
    />
  );
}
