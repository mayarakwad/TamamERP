import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { bizPage } from "@/lib/biz";
import { monthKey, monthStart, addMonths } from "@/lib/format";
import { leaveBalance, monthDays, parseWeekend, dohaWeekday, ymdOf } from "@/lib/hr/ops";
import { gratuityEstimate } from "@/lib/payroll/calc";
import { getThread } from "@/lib/thread";
import { EmployeeDetail } from "@/components/business/employee-detail";

export const metadata: Metadata = { title: "Employee" };

export default async function EmployeePage({ params }: PageProps<"/w/[slug]/hr/employees/[id]">) {
  const { slug, id } = await params;
  const ws = await bizPage(slug, ["hr.view"], ["business", "school"]);
  await connection();
  const e = await db.employee.findFirst({ where: { id, orgId: ws.org.id } });
  if (!e) notFound();
  const now = new Date();
  const month = monthKey(now, ws.org.timezone);
  const days = monthDays(month);
  const weekend = parseWeekend(ws.org.weekend);
  const [att, slips, leave, thread, depts, members, balance] = await Promise.all([
    db.attendanceDay.findMany({ where: { employeeId: id, date: { gte: monthStart(month), lt: monthStart(addMonths(month, 1)) } } }),
    db.payslip.findMany({ where: { employeeId: id }, include: { run: true }, orderBy: { run: { month: "desc" } }, take: 12 }),
    db.leaveRequest.findMany({ where: { employeeId: id }, orderBy: { startDate: "desc" }, take: 10 }),
    getThread(ws.org.id, "employee", id),
    db.employee.findMany({ where: { orgId: ws.org.id, department: { not: null } }, distinct: ["department"], select: { department: true } }),
    db.membership.findMany({ where: { orgId: ws.org.id, status: "active" }, include: { user: { select: { id: true, name: true } } } }),
    leaveBalance(db, e, now),
  ]);
  const byDay = new Map(att.map((a) => [ymdOf(a.date), a]));
  const today = ymdOf(now);
  const cal = days.map((d) => {
    const key = ymdOf(d);
    const off = weekend.includes(dohaWeekday(d));
    const status = byDay.get(key)?.status ?? (!off && key < today && d >= e.joinedOn ? "absent" : null);
    return { date: key, status, off };
  });
  const count = (s: string[]) => cal.filter((c) => c.status && s.includes(c.status)).length;
  const campus = ws.org.campuses.find((c) => c.id === e.campusId);
  return (
    <EmployeeDetail
      slug={slug}
      emp={{ ...e, qidExpiry: e.qidExpiry?.toISOString() ?? null, passportExpiry: e.passportExpiry?.toISOString() ?? null, joinedOn: e.joinedOn.toISOString() }}
      number={e.number}
      status={e.status}
      campusName={campus ? (ws.viewer.prefs.locale === "ar" ? (campus.nameAr ?? campus.name) : campus.name) : null}
      balance={balance}
      gratuity={gratuityEstimate(e.basicSalary, e.joinedOn, now)}
      month={{ present: count(["present", "late"]), late: count(["late"]), absent: count(["absent"]), leave: count(["leave", "sick"]), overtimeMin: att.reduce((s, a) => s + a.overtimeMin, 0), days: cal }}
      payslips={slips.filter((p) => p.run.status !== "draft").map((p) => ({ id: p.id, month: p.run.month, net: p.net, status: p.run.status }))}
      leave={leave.map((l) => ({ id: l.id, number: l.number, type: l.type, from: l.startDate.toISOString(), to: l.endDate.toISOString(), days: l.days, status: l.status }))}
      thread={thread}
      viewerId={ws.viewer.id}
      now={now.toISOString()}
      canManage={ws.can("hr.manage")}
      showPay={ws.can("payroll.run") || ws.can("hr.manage")}
      campuses={ws.org.campuses.map((c) => ({ id: c.id, name: c.name, nameAr: c.nameAr }))}
      departments={depts.map((d) => d.department!)}
      members={members.map((m) => ({ userId: m.user.id, name: m.user.name }))}
    />
  );
}
