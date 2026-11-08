import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { ymdOf } from "@/lib/hr/ops";
import { schoolPage } from "@/lib/school/scope";
import { CampusesView } from "@/components/school/campuses";

export const metadata: Metadata = { title: "All campuses" };

const DAY = 86400_000;

export default async function CampusesPage({ params }: PageProps<"/w/[slug]/campuses">) {
  const { slug } = await params;
  const s = await schoolPage(slug, ["school.manage"]);
  await connection();
  const locale = s.ws.viewer.prefs.locale;
  const orgId = s.ws.org.id;
  const now = new Date();
  const today = new Date(`${ymdOf(now)}T12:00:00+03:00`);
  const campuses = s.ws.org.campuses.filter((c) => !s.locked || s.campusIds.includes(c.id));
  const [students, sections, staff, rolls, docs, routes, apps, marks] = await Promise.all([
    db.student.groupBy({ by: ["campusId"], where: { orgId, status: "active" }, _count: { _all: true } }),
    db.section.findMany({ where: { orgId, yearId: s.year.id }, select: { id: true, campusId: true, capacity: true } }),
    db.employee.groupBy({ by: ["campusId"], where: { orgId, status: "active" }, _count: { _all: true } }),
    db.attendanceRoll.findMany({ where: { orgId, date: { gte: new Date(today.getTime() - 40 * DAY), lte: today } }, select: { date: true, size: true, absent: true, excused: true, section: { select: { campusId: true } } } }),
    db.document.findMany({ where: { orgId, kind: "fee", status: { notIn: ["draft", "void"] }, installment: { startsWith: `${s.year.name}/` } }, select: { total: true, paid: true, dueDate: true, status: true, campusId: true } }),
    db.busRoute.groupBy({ by: ["campusId"], where: { orgId }, _count: { _all: true } }),
    db.application.groupBy({ by: ["campusId"], where: { orgId, stage: { in: ["applied", "assessment", "offered"] } }, _count: { _all: true } }),
    db.mark.findMany({ where: { orgId, absent: false, score: { not: null }, assessment: { termId: s.term.id } }, select: { score: true, assessment: { select: { maxScore: true, section: { select: { campusId: true } } } } } }),
  ]);
  const days = [...new Set(rolls.map((r) => ymdOf(r.date)))].sort().slice(-20);
  const data = campuses.map((c) => {
    const secs = sections.filter((x) => x.campusId === c.id);
    const mine = rolls.filter((r) => r.section.campusId === c.id);
    const rate = (list: typeof mine) => {
      const size = list.reduce((x, r) => x + r.size, 0);
      return size ? (size - list.reduce((x, r) => x + r.absent + r.excused, 0)) / size : null;
    };
    const fees = docs.filter((d) => d.campusId === c.id);
    const m = marks.filter((x) => x.assessment.section.campusId === c.id);
    return {
      id: c.id,
      name: pick(locale, c.name, c.nameAr),
      code: c.code,
      color: c.color,
      students: students.find((x) => x.campusId === c.id)?._count._all ?? 0,
      capacity: secs.reduce((x, y) => x + y.capacity, 0),
      classes: secs.length,
      staff: staff.find((x) => x.campusId === c.id)?._count._all ?? 0,
      attendance: rate(mine.filter((r) => ymdOf(r.date) === ymdOf(today))),
      trend: days.map((d) => rate(mine.filter((r) => ymdOf(r.date) === d)) ?? 0),
      billed: fees.reduce((x, d) => x + d.total, 0),
      collected: fees.reduce((x, d) => x + d.paid, 0),
      overdue: fees.filter((d) => (d.status === "issued" || d.status === "partial") && d.dueDate && d.dueDate < now).reduce((x, d) => x + d.total - d.paid, 0),
      buses: routes.find((x) => x.campusId === c.id)?._count._all ?? 0,
      applications: apps.find((x) => x.campusId === c.id)?._count._all ?? 0,
      average: m.length ? Math.round((m.reduce((x, y) => x + y.score! / 100 / y.assessment.maxScore, 0) / m.length) * 1000) / 10 : null,
    };
  });
  return <CampusesView slug={slug} campuses={data} days={days} selected={s.campus?.id ?? null} />;
}
