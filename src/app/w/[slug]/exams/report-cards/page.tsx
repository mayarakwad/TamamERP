import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { schoolPage, sectionScope } from "@/lib/school/scope";
import { termPercent } from "@/lib/school/grading";
import { bandFor, sectionName } from "@/lib/school/settings";
import { ReportCards } from "@/components/school/report-cards";

export const metadata: Metadata = { title: "Report cards" };

const DAY = 86400_000;

export default async function ReportCardsPage({ params, searchParams }: PageProps<"/w/[slug]/exams/report-cards">) {
  const { slug } = await params;
  const sp = await searchParams;
  const s = await schoolPage(slug, ["school.manage", "school.teach"]);
  await connection();
  const locale = s.ws.viewer.prefs.locale;
  const sectionId = typeof sp.section === "string" ? sp.section : (s.homeroomIds[0] ?? "");
  const termId = typeof sp.term === "string" && s.year.terms.some((x) => x.id === sp.term) ? sp.term : s.term.id;
  const term = s.year.terms.find((x) => x.id === termId)!;
  const sec = await db.section.findFirst({ where: { ...sectionScope(s), id: sectionId }, include: { grade: true, campus: true, homeroom: { select: { name: true, nameAr: true } } } });
  if (!sec) notFound();
  const until = new Date(Math.min(term.endDate.getTime() + DAY, new Date().getTime() + DAY));
  const [students, cards, assignments, assessments, rolls, absences] = await Promise.all([
    db.student.findMany({ where: { sectionId, status: "active" }, orderBy: { name: "asc" } }),
    db.reportCard.findMany({ where: { termId, student: { sectionId } } }),
    db.teachingAssignment.findMany({ where: { sectionId }, include: { subject: true }, orderBy: { subject: { sort: "asc" } } }),
    db.assessment.findMany({ where: { sectionId, termId }, include: { marks: true } }),
    db.attendanceRoll.count({ where: { sectionId, date: { gte: term.startDate, lt: until } } }),
    db.studentAttendance.findMany({ where: { sectionId, date: { gte: term.startDate, lt: until } }, select: { studentId: true, status: true } }),
  ]);
  const card = new Map(cards.map((c) => [c.studentId, c]));
  const rows = students.map((st) => {
    const subjects = assignments.map((a) => {
      const mine = assessments.filter((x) => x.subjectId === a.subjectId);
      const pct = termPercent(
        mine.map((x) => ({ id: x.id, maxScore: x.maxScore, weight: x.weight })),
        mine.flatMap((x) => x.marks.filter((m) => m.studentId === st.id).map((m) => ({ assessmentId: x.id, score: m.score, absent: m.absent }))),
      );
      return { subject: pick(locale, a.subject.name, a.subject.nameAr), color: a.subject.color, percent: pct, letter: bandFor(s.settings.scale, pct)?.letter ?? null };
    });
    const scored = subjects.filter((x) => x.percent != null);
    const c = card.get(st.id);
    const mine = absences.filter((x) => x.studentId === st.id);
    return {
      id: st.id,
      cardId: c?.id ?? null,
      name: pick(locale, st.name, st.nameAr),
      plainName: st.name,
      firstName: pick(locale, st.name, st.nameAr).split(" ")[0],
      gender: st.gender,
      color: st.avatarColor,
      status: c?.status ?? "none",
      teacherComment: c?.teacherComment ?? "",
      principalComment: c?.principalComment ?? "",
      average: scored.length ? Math.round((scored.reduce((x, y) => x + y.percent!, 0) / scored.length) * 10) / 10 : null,
      subjects,
      attendance: { days: rolls, away: mine.filter((x) => x.status !== "late").length },
    };
  });
  return (
    <ReportCards
      slug={slug}
      section={{ id: sec.id, label: sectionName(locale, sec.grade, sec.name), campus: pick(locale, sec.campus.name, sec.campus.nameAr), homeroom: sec.homeroom ? pick(locale, sec.homeroom.name, sec.homeroom.nameAr) : null }}
      term={{ id: term.id, name: pick(locale, term.name, term.nameAr) }}
      terms={s.year.terms.map((x) => ({ id: x.id, name: pick(locale, x.name, x.nameAr) }))}
      students={rows}
      canTeacher={s.ws.can("school.manage") || s.homeroomIds.includes(sec.id)}
      canPrincipal={s.ws.can("school.manage")}
      passMark={s.settings.passMark}
    />
  );
}
