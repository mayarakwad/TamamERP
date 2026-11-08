import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { bizPage, i18nFor, toQuery } from "@/lib/biz";
import { employeesDataset } from "@/lib/datasets/hr";
import { EmployeesView } from "@/components/business/employees-view";

export const metadata: Metadata = { title: "Employees" };

export default async function EmployeesPage({ params, searchParams }: PageProps<"/w/[slug]/hr/employees">) {
  const { slug } = await params;
  const ws = await bizPage(slug, ["hr.view"], ["business", "school"]);
  const query = toQuery(await searchParams);
  const { locale, t } = await i18nFor(ws);
  await connection();
  const now = new Date();
  const soon = new Date(now.getTime() + 60 * 86400_000);
  const [result, all, depts, members] = await Promise.all([
    employeesDataset.load(ws, query, { locale, t }),
    db.employee.findMany({ where: { orgId: ws.org.id }, select: { status: true, qidExpiry: true, passportExpiry: true, basicSalary: true, housingAllowance: true, transportAllowance: true, foodAllowance: true, otherAllowance: true } }),
    db.employee.findMany({ where: { orgId: ws.org.id, department: { not: null } }, distinct: ["department"], select: { department: true }, orderBy: { department: "asc" } }),
    db.membership.findMany({ where: { orgId: ws.org.id, status: "active" }, include: { user: { select: { id: true, name: true } } } }),
  ]);
  const active = all.filter((e) => e.status === "active");
  const pay = ws.can("payroll.run") || ws.can("hr.manage");
  return (
    <EmployeesView
      slug={slug}
      query={query.toString()}
      result={result}
      canShare={ws.can("exports.share")}
      canManage={ws.can("hr.manage")}
      counts={{ active: active.length, expiring: active.filter((e) => (e.qidExpiry && e.qidExpiry <= soon) || (e.passportExpiry && e.passportExpiry <= soon)).length, left: all.length - active.length }}
      payroll={pay ? active.reduce((s, e) => s + e.basicSalary + e.housingAllowance + e.transportAllowance + e.foodAllowance + e.otherAllowance, 0) : null}
      campuses={ws.org.campuses.map((c) => ({ id: c.id, name: c.name, nameAr: c.nameAr }))}
      departments={depts.map((d) => d.department!)}
      members={members.map((m) => ({ userId: m.user.id, name: m.user.name }))}
    />
  );
}
