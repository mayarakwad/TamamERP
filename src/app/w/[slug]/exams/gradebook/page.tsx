import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { schoolPage, sectionScope } from "@/lib/school/scope";
import { sectionName } from "@/lib/school/settings";
import { Gradebook } from "@/components/school/gradebook";

export const metadata: Metadata = { title: "Gradebook" };

export default async function GradebookPage({ params, searchParams }: PageProps<"/w/[slug]/exams/gradebook">) {
  const { slug } = await params;
  const sp = await searchParams;
  const s = await schoolPage(slug, ["school.manage", "school.teach"]);
  await connection();
  const locale = s.ws.viewer.prefs.locale;
  const sectionId = typeof sp.section === "string" ? sp.section : "";
  const subjectId = typeof sp.subject === "string" ? sp.subject : "";
  const termId = typeof sp.term === "string" && s.year.terms.some((x) => x.id === sp.term) ? sp.term : s.term.id;
  const sec = await db.section.findFirst({ where: { ...sectionScope(s), id: sectionId }, include: { grade: true, campus: true } });
  const assignment = sec ? await db.teachingAssignment.findUnique({ where: { sectionId_subjectId: { sectionId, subjectId } }, include: { subject: true, teacher: { select: { id: true, name: true, nameAr: true } } } }) : null;
  if (!sec || !assignment) notFound();
  const canEdit = s.ws.can("school.manage") || (!!s.employee && assignment.teacherId === s.employee.id);
  const [students, assessments, others] = await Promise.all([
    db.student.findMany({ where: { sectionId, status: "active" }, orderBy: { name: "asc" }, select: { id: true, name: true, nameAr: true, avatarColor: true, number: true } }),
    db.assessment.findMany({ where: { sectionId, subjectId, termId }, include: { marks: true }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    // Switch quickly between this teacher's other gradebooks.
    db.teachingAssignment.findMany({
      where: s.ws.can("school.manage") ? { sectionId } : { teacherId: s.employee?.id ?? "__none__", section: { yearId: s.year.id } },
      include: { subject: true, section: { include: { grade: true } } },
      orderBy: [{ section: { grade: { level: "asc" } } }, { subject: { sort: "asc" } }],
    }),
  ]);
  return (
    <Gradebook
      slug={slug}
      section={{ id: sec.id, label: sectionName(locale, sec.grade, sec.name), campus: pick(locale, sec.campus.name, sec.campus.nameAr) }}
      subject={{ id: assignment.subjectId, name: pick(locale, assignment.subject.name, assignment.subject.nameAr), color: assignment.subject.color, teacher: assignment.teacher ? pick(locale, assignment.teacher.name, assignment.teacher.nameAr) : null }}
      termId={termId}
      terms={s.year.terms.map((x) => ({ id: x.id, name: pick(locale, x.name, x.nameAr) }))}
      students={students.map((st) => ({ id: st.id, name: pick(locale, st.name, st.nameAr), plainName: st.name, color: st.avatarColor }))}
      assessments={assessments.map((a) => ({ id: a.id, name: a.name, nameAr: a.nameAr, kind: a.kind as "exam", date: a.date.toISOString(), maxScore: a.maxScore, weight: a.weight }))}
      marks={assessments.flatMap((a) => a.marks.map((m) => ({ assessmentId: a.id, studentId: m.studentId, score: m.score, absent: m.absent })))}
      scale={s.settings.scale}
      passMark={s.settings.passMark}
      canEdit={canEdit}
      now={new Date().toISOString()}
      others={others.map((o) => ({ sectionId: o.sectionId, subjectId: o.subjectId, label: `${sectionName(locale, o.section.grade, o.section.name)} · ${pick(locale, o.subject.name, o.subject.nameAr)}` }))}
    />
  );
}
