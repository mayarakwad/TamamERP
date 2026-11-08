import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { schoolPage, sectionScope } from "@/lib/school/scope";
import { sectionName } from "@/lib/school/settings";
import { ClassesView } from "@/components/school/classes-view";

export const metadata: Metadata = { title: "Classes" };

export default async function ClassesPage({ params }: PageProps<"/w/[slug]/classes">) {
  const { slug } = await params;
  const s = await schoolPage(slug, ["school.manage", "school.teach"]);
  await connection();
  const locale = s.ws.viewer.prefs.locale;
  const today = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(new Date())}T12:00:00+03:00`);
  const [sections, grades, staff] = await Promise.all([
    db.section.findMany({
      where: sectionScope(s),
      include: {
        grade: true,
        campus: true,
        homeroom: { select: { id: true, name: true, nameAr: true } },
        _count: { select: { students: { where: { status: "active" } }, slots: true } },
        assignments: { select: { periods: true } },
        rolls: { where: { date: today }, select: { absent: true, size: true } },
      },
      orderBy: [{ grade: { level: "asc" } }, { name: "asc" }],
    }),
    db.grade.findMany({ where: { orgId: s.ws.org.id }, orderBy: { level: "asc" } }),
    s.ws.can("school.manage") ? db.employee.findMany({ where: { orgId: s.ws.org.id, status: "active", campusId: { in: s.campusIds } }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true, jobTitle: true, campusId: true } }) : Promise.resolve([]),
  ]);
  return (
    <ClassesView
      slug={slug}
      yearName={s.year.name}
      canManage={s.ws.can("school.manage")}
      mine={!s.ws.can("school.manage")}
      sections={sections.map((x) => ({
        id: x.id,
        label: sectionName(locale, x.grade, x.name),
        name: x.name,
        level: x.grade.level,
        grade: pick(locale, x.grade.name, x.grade.nameAr),
        gradeId: x.gradeId,
        campusId: x.campusId,
        campus: pick(locale, x.campus.name, x.campus.nameAr),
        campusColor: x.campus.color,
        room: x.room,
        capacity: x.capacity,
        homeroomId: x.homeroomId,
        homeroom: x.homeroom ? pick(locale, x.homeroom.name, x.homeroom.nameAr) : null,
        students: x._count.students,
        placed: x._count.slots,
        needed: x.assignments.reduce((sum, a) => sum + a.periods, 0),
        roll: x.rolls[0] ? { absent: x.rolls[0].absent } : null,
        homeroomMine: s.homeroomIds.includes(x.id),
      }))}
      grades={grades.map((g) => ({ id: g.id, name: pick(locale, g.name, g.nameAr) }))}
      campuses={s.ws.org.campuses.filter((c) => s.campusIds.includes(c.id)).map((c) => ({ id: c.id, name: pick(locale, c.name, c.nameAr) }))}
      staff={staff.map((e) => ({ id: e.id, name: pick(locale, e.name, e.nameAr), title: e.jobTitle, campusId: e.campusId }))}
      schoolDay={s.settings.days.includes(new Date(today.getTime() + 3 * 3600_000).getUTCDay())}
    />
  );
}
