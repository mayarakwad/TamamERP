import type { Metadata } from "next";
import { db } from "@/lib/db";
import { bizPage } from "@/lib/biz";
import { MyPayslips } from "@/components/business/payroll-views";

export const metadata: Metadata = { title: "My payslips" };

export default async function MyPayslipsPage({ params }: PageProps<"/w/[slug]/hr/payslips">) {
  const { slug } = await params;
  const ws = await bizPage(slug, [], ["business", "school"]);
  const me = await db.employee.findFirst({ where: { orgId: ws.org.id, userId: ws.viewer.id } });
  const slips = me ? await db.payslip.findMany({ where: { employeeId: me.id, run: { status: { not: "draft" } } }, include: { run: true }, orderBy: { run: { month: "desc" } } }) : [];
  return <MyPayslips slug={slug} linked={!!me} slips={slips.map((s) => ({ id: s.id, month: s.run.month, net: s.net, gross: s.gross, deductions: s.deductions, status: s.run.status }))} />;
}
