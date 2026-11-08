import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { canTeach, schoolPage, sectionScope } from "@/lib/school/scope";
import { sectionLabel, sectionName } from "@/lib/school/settings";
import { monthDays, ymdOf } from "@/lib/hr/ops";
import { monthKey } from "@/lib/format";
import { ClassDetail } from "@/components/school/class-detail";

export const metadata: Metadata = { title: "Class" };

export default async function ClassPage({ params, searchParams }: PageProps<"/w/[slug]/classes/[id]">) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const s = await schoolPage(slug, ["school.manage", "school.teach"]);
  await connection();
  const locale = s.ws.viewer.prefs.locale;
  const sec = await db.section.findFirst({
    where: { ...sectionScope(s), id },
    include: { grade: true, campus: true, homeroom: { select: { id: true, name: true, nameAr: true } } },
  });
  if (!sec) notFound();
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : monthKey(new Date(), s.ws.org.timezone);
  const days = monthDays(month);
  const [students, assignments, slots, staff, rolls, absences] = await Promise.all([
    db.student.findMany({ where: { sectionId: id, status: "active" }, include: { guardians: { where: { primary: true }, include: { guardian: { select: { phone: true } } }, take: 1 } }, orderBy: { name: "asc" } }),
    db.teachingAssignment.findMany({ where: { sectionId: id }, include: { subject: true, teacher: { select: { id: true, name: true, nameAr: true } } }, orderBy: { subject: { sort: "asc" } } }),
    db.timetableSlot.findMany({ where: { sectionId: id } }),
    s.ws.can("school.manage") ? db.employee.findMany({ where: { orgId: s.ws.org.id, status: "active", OR: [{ campusId: sec.campusId }, { campusId: null }] }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true, jobTitle: true, department: true } }) : Promise.resolve([]),
    db.attendanceRoll.findMany({ where: { sectionId: id, date: { gte: days[0], lte: days[days.length - 1] } }, orderBy: { date: "asc" } }),
    db.studentAttendance.findMany({ where: { sectionId: id, date: { gte: days[0], lte: days[days.length - 1] } } }),
  ]);
  // Where this class's teachers are busy elsewhere, so the builder can grey those periods out.
  const teacherIds = [...new Set(assignments.map((a) => a.teacherId).filter((x): x is string => !!x))];
  const elsewhere = s.ws.can("school.manage")
    ? await db.timetableSlot.findMany({ where: { teacherId: { in: teacherIds }, NOT: { sectionId: id }, section: { yearId: s.year.id } }, include: { section: { include: { grade: true } } } })
    : [];
  const subjectById = new Map(assignments.map((a) => [a.subjectId, a]));
  return (
    <ClassDetail
      slug={slug}
      section={{
        id: sec.id,
        label: sectionName(locale, sec.grade, sec.name),
        name: sec.name,
        level: sec.grade.level,
        grade: pick(locale, sec.grade.name, sec.grade.nameAr),
        gradeId: sec.gradeId,
        campusId: sec.campusId,
        campus: pick(locale, sec.campus.name, sec.campus.nameAr),
        campusColor: sec.campus.color,
        room: sec.room,
        capacity: sec.capacity,
        homeroomId: sec.homeroomId,
        homeroom: sec.homeroom ? pick(locale, sec.homeroom.name, sec.homeroom.nameAr) : null,
        students: students.length,
        placed: slots.length,
        needed: assignments.reduce((x, a) => x + a.periods, 0),
        roll: null,
        homeroomMine: s.homeroomIds.includes(sec.id),
      }}
      students={students.map((st) => ({ id: st.id, name: pick(locale, st.name, st.nameAr), plainName: st.name, number: st.number, color: st.avatarColor, medical: st.medical, gender: st.gender, phone: st.guardians[0]?.guardian.phone ?? null }))}
      assignments={assignments.map((a) => ({ subjectId: a.subjectId, code: a.subject.code, subject: pick(locale, a.subject.name, a.subject.nameAr), color: a.subject.color, teacherId: a.teacherId, teacher: a.teacher ? pick(locale, a.teacher.name, a.teacher.nameAr) : null, periods: a.periods, placed: slots.filter((x) => x.subjectId === a.subjectId).length }))}
      slots={slots.map((x) => {
        const a = subjectById.get(x.subjectId);
        return { day: x.day, period: x.period, subjectId: x.subjectId, title: a ? pick(locale, a.subject.name, a.subject.nameAr) : "?", sub: a?.teacher ? pick(locale, a.teacher.name, a.teacher.nameAr) : null, color: a?.subject.color ?? null };
      })}
      elsewhere={elsewhere.map((x) => ({ teacherId: x.teacherId!, day: x.day, period: x.period, label: sectionLabel(x.section.grade, x.section.name) }))}
      subjects={(await db.subject.findMany({ where: { orgId: s.ws.org.id }, orderBy: { sort: "asc" } })).map((x) => ({ id: x.id, name: pick(locale, x.name, x.nameAr) }))}
      staff={staff.map((e) => ({ id: e.id, name: pick(locale, e.name, e.nameAr), title: e.jobTitle, department: e.department }))}
      settings={{ days: s.settings.days, periods: s.settings.periods, breaks: s.settings.breaks }}
      register={{
        month,
        days: days.map((d) => ymdOf(d)),
        rolls: rolls.map((r) => ymdOf(r.date)),
        marks: absences.map((a) => ({ studentId: a.studentId, date: ymdOf(a.date), status: a.status })),
      }}
      grades={(await db.grade.findMany({ where: { orgId: s.ws.org.id }, orderBy: { level: "asc" } })).map((g) => ({ id: g.id, name: pick(locale, g.name, g.nameAr) }))}
      campuses={s.ws.org.campuses.filter((c) => s.campusIds.includes(c.id)).map((c) => ({ id: c.id, name: pick(locale, c.name, c.nameAr) }))}
      canManage={s.ws.can("school.manage")}
      canTeach={canTeach(s, sec.id)}
      termId={s.term.id}
    />
  );
}
