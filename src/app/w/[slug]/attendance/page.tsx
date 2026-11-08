import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { canTeach, schoolPage, sectionScope } from "@/lib/school/scope";
import { sectionName } from "@/lib/school/settings";
import { dohaWeekday } from "@/lib/hr/ops";
import { RollCall } from "@/components/school/roll-call";

export const metadata: Metadata = { title: "Attendance" };

const ymdNow = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(new Date());

export default async function AttendancePage({ params, searchParams }: PageProps<"/w/[slug]/attendance">) {
  const { slug } = await params;
  const sp = await searchParams;
  const s = await schoolPage(slug, ["school.manage", "school.teach"]);
  await connection();
  const locale = s.ws.viewer.prefs.locale;
  const today = ymdNow();
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;
  const day = new Date(`${date}T12:00:00+03:00`);
  const sections = await db.section.findMany({
    where: sectionScope(s),
    include: { grade: true, campus: true, homeroom: { select: { name: true, nameAr: true } }, rolls: { where: { date: day } }, _count: { select: { students: { where: { status: "active" } } } } },
    orderBy: [{ grade: { level: "asc" } }, { name: "asc" }],
  });
  // A teacher lands on their own homeroom; the office sees the overview until they pick a class.
  const requested = typeof sp.section === "string" ? sp.section : null;
  const sectionId = requested && sections.some((x) => x.id === requested) ? requested : !s.ws.can("school.manage") ? (s.homeroomIds[0] ?? sections[0]?.id ?? null) : null;
  const selected = sectionId ? sections.find((x) => x.id === sectionId)! : null;
  const [students, marks, absentToday, takers] = await Promise.all([
    selected ? db.student.findMany({ where: { sectionId: selected.id, status: "active" }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    selected ? db.studentAttendance.findMany({ where: { sectionId: selected.id, date: day } }) : Promise.resolve([]),
    !selected ? db.studentAttendance.findMany({ where: { orgId: s.ws.org.id, date: day, status: "absent", section: sectionScope(s) }, include: { student: true, section: { include: { grade: true } } }, take: 400 }) : Promise.resolve([]),
    db.user.findMany({ where: { id: { in: sections.flatMap((x) => x.rolls.map((r) => r.takenById)) } }, select: { id: true, name: true, nameAr: true } }),
  ]);
  const takerName = new Map(takers.map((u) => [u.id, pick(locale, u.name, u.nameAr)]));
  // Children absent 3+ days in the last week (for the office overview).
  const weekAgo = new Date(day.getTime() - 7 * 86400_000);
  const frequent = !selected
    ? await db.studentAttendance.groupBy({ by: ["studentId"], where: { orgId: s.ws.org.id, status: "absent", date: { gte: weekAgo, lt: day }, section: sectionScope(s) }, _count: { _all: true }, having: { studentId: { _count: { gte: 3 } } } })
    : [];
  const frequentStudents = frequent.length ? await db.student.findMany({ where: { id: { in: frequent.map((f) => f.studentId) } }, include: { grade: true, section: true } }) : [];
  const roll = selected?.rolls[0];
  return (
    <RollCall
      slug={slug}
      date={date}
      today={today}
      schoolDay={s.settings.days.includes(dohaWeekday(day))}
      canManage={s.ws.can("school.manage")}
      sections={sections.map((x) => ({
        id: x.id,
        label: sectionName(locale, x.grade, x.name),
        campus: pick(locale, x.campus.name, x.campus.nameAr),
        homeroom: x.homeroom ? pick(locale, x.homeroom.name, x.homeroom.nameAr) : null,
        size: x._count.students,
        roll: x.rolls[0] ? { absent: x.rolls[0].absent, late: x.rolls[0].late, excused: x.rolls[0].excused, size: x.rolls[0].size, at: x.rolls[0].takenAt.toISOString() } : null,
        mine: s.homeroomIds.includes(x.id),
      }))}
      selected={
        selected
          ? {
              id: selected.id,
              label: sectionName(locale, selected.grade, selected.name),
              canEdit: canTeach(s, selected.id),
              taken: roll ? { at: roll.takenAt.toISOString(), by: takerName.get(roll.takenById) ?? (selected.homeroom ? pick(locale, selected.homeroom.name, selected.homeroom.nameAr) : null) } : null,
              students: students.map((st) => ({ id: st.id, name: pick(locale, st.name, st.nameAr), plainName: st.name, color: st.avatarColor, medical: st.medical })),
              marks: marks.map((m) => ({ studentId: m.studentId, status: m.status as "absent" | "late" | "excused", minutes: m.minutes, note: m.note })),
            }
          : null
      }
      absentToday={absentToday.map((a) => ({ id: a.studentId, name: pick(locale, a.student.name, a.student.nameAr), className: sectionName(locale, a.section.grade, a.section.name), note: a.note }))}
      frequent={frequentStudents.map((st) => ({ id: st.id, name: pick(locale, st.name, st.nameAr), className: st.section ? sectionName(locale, st.grade, st.section.name) : "", days: frequent.find((f) => f.studentId === st.id)!._count._all }))}
    />
  );
}
