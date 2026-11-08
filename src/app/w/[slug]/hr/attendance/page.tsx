import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { bizPage, i18nFor, toQuery } from "@/lib/biz";
import { attendanceDataset } from "@/lib/datasets/hr";
import { monthKey } from "@/lib/format";
import { monthDays, ymdOf } from "@/lib/hr/ops";
import { AttendanceView } from "@/components/business/attendance-view";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage({ params, searchParams }: PageProps<"/w/[slug]/hr/attendance">) {
  const { slug } = await params;
  const ws = await bizPage(slug, [], ["business", "school"]);
  await connection();
  const query = toQuery(await searchParams);
  const thisMonth = monthKey(new Date(), ws.org.timezone);
  const month = /^\d{4}-\d{2}$/.test(query.get("month") ?? "") && query.get("month")! <= thisMonth ? query.get("month")! : thisMonth;
  query.set("month", month);
  const { locale, t } = await i18nFor(ws);
  const days = monthDays(month);
  const [result, me, recs] = await Promise.all([
    attendanceDataset.load(ws, query, { locale, t }),
    db.employee.findFirst({ where: { orgId: ws.org.id, userId: ws.viewer.id, status: "active" } }),
    ws.can("hr.manage") ? db.attendanceDay.findMany({ where: { orgId: ws.org.id, date: { gte: days[0], lte: days[days.length - 1] } } }) : Promise.resolve([]),
  ]);
  const today = me ? await db.attendanceDay.findUnique({ where: { employeeId_date: { employeeId: me.id, date: new Date(`${ymdOf(new Date())}T12:00:00+03:00`) } } }) : null;
  return (
    <AttendanceView
      slug={slug}
      month={month}
      thisMonth={thisMonth}
      query={query.toString()}
      result={result}
      canShare={ws.can("exports.share")}
      canManage={ws.can("hr.manage")}
      me={me ? { id: me.id, checkIn: today?.checkIn ?? null, checkOut: today?.checkOut ?? null } : null}
      records={Object.fromEntries(recs.map((r) => [`${r.employeeId}|${ymdOf(r.date)}`, { status: r.status, checkIn: r.checkIn, checkOut: r.checkOut, overtimeMin: r.overtimeMin, note: r.note }]))}
    />
  );
}
