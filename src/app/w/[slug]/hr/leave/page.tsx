import type { Metadata } from "next";
import { db } from "@/lib/db";
import { bizPage, i18nFor, toQuery } from "@/lib/biz";
import { leaveDataset } from "@/lib/datasets/hr";
import { leaveBalance, parseWeekend } from "@/lib/hr/ops";
import { LeaveView } from "@/components/business/leave-view";

export const metadata: Metadata = { title: "Leave" };

export default async function LeavePage({ params, searchParams }: PageProps<"/w/[slug]/hr/leave">) {
  const { slug } = await params;
  const ws = await bizPage(slug, [], ["business", "school"]);
  const query = toQuery(await searchParams);
  const { locale, t } = await i18nFor(ws);
  const all = ws.can("hr.view") || ws.can("leave.approve");
  const me = await db.employee.findFirst({ where: { orgId: ws.org.id, userId: ws.viewer.id, status: "active" } });
  const statusFree = new URLSearchParams(query);
  statusFree.delete("status");
  const [result, groups, employees, balance] = await Promise.all([
    leaveDataset.load(ws, query, { locale, t }),
    db.leaveRequest.groupBy({ by: ["status"], where: { orgId: ws.org.id, ...(all ? {} : { employee: { userId: ws.viewer.id } }) }, _count: { _all: true } }),
    ws.can("hr.manage") ? db.employee.findMany({ where: { orgId: ws.org.id, status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true, number: true } }) : Promise.resolve([]),
    me ? leaveBalance(db, me) : Promise.resolve(null),
  ]);
  return (
    <LeaveView
      slug={slug}
      query={query.toString()}
      result={result}
      canShare={ws.can("exports.share")}
      canApprove={ws.can("leave.approve") || ws.can("hr.manage")}
      canManage={ws.can("hr.manage")}
      balance={balance}
      employees={employees}
      weekend={parseWeekend(ws.org.weekend)}
      counts={Object.fromEntries(groups.map((g) => [g.status, g._count._all]))}
      viewerIsOwner={ws.role === "owner"}
    />
  );
}
