import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { schoolPage, sectionScope } from "@/lib/school/scope";
import { sectionName } from "@/lib/school/settings";
import { ExamsOverview } from "@/components/school/exams-overview";

export const metadata: Metadata = { title: "Exams and grades" };

export default async function ExamsPage({ params }: PageProps<"/w/[slug]/exams">) {
  const { slug } = await params;
  const s = await schoolPage(slug, ["school.manage", "school.teach"]);
  await connection();
  const locale = s.ws.viewer.prefs.locale;
  const manage = s.ws.can("school.manage");
  const now = new Date();
  const sections = await db.section.findMany({ where: sectionScope(s), include: { grade: true, homeroom: { select: { name: true, nameAr: true } }, _count: { select: { students: { where: { status: "active" } } } } }, orderBy: [{ grade: { level: "asc" } }, { name: "asc" }] });
  const sectionIds = sections.map((x) => x.id);
  const size = new Map(sections.map((x) => [x.id, x._count.students]));
  const label = new Map(sections.map((x) => [x.id, sectionName(locale, x.grade, x.name)]));
  const [assignments, assessments, cards] = await Promise.all([
    db.teachingAssignment.findMany({ where: manage ? { sectionId: { in: sectionIds } } : { teacherId: s.employee?.id ?? "__none__", sectionId: { in: sectionIds } }, include: { subject: true }, orderBy: [{ section: { grade: { level: "asc" } } }, { subject: { sort: "asc" } }] }),
    db.assessment.findMany({ where: { termId: s.term.id, sectionId: { in: sectionIds } }, include: { _count: { select: { marks: true } } }, orderBy: { date: "asc" } }),
    db.reportCard.groupBy({ by: ["sectionId", "status"], where: { termId: s.term.id, sectionId: { in: sectionIds } }, _count: { _all: true } }),
  ]);
  const due = (a: (typeof assessments)[number]) => a.date < now;
  const isMarked = (a: (typeof assessments)[number]) => a._count.marks >= Math.max(1, Math.floor((size.get(a.sectionId) ?? 0) * 0.8));
  const books = assignments.map((a) => {
    const mine = assessments.filter((x) => x.sectionId === a.sectionId && x.subjectId === a.subjectId);
    const next = mine.find((x) => !due(x));
    return {
      sectionId: a.sectionId,
      subjectId: a.subjectId,
      section: label.get(a.sectionId) ?? "",
      subject: pick(locale, a.subject.name, a.subject.nameAr),
      color: a.subject.color,
      done: mine.filter((x) => due(x) && isMarked(x)).length,
      total: mine.filter(due).length,
      next: next ? { name: pick(locale, next.name, next.nameAr), date: next.date.toISOString() } : null,
    };
  });
  // Exams scheduled this term, grouped by name.
  const seriesMap = new Map<string, { name: string; from: Date; to: Date; total: number; marked: number }>();
  for (const a of assessments.filter((x) => x.kind === "exam")) {
    const k = a.name;
    const cur = seriesMap.get(k) ?? { name: pick(locale, a.name, a.nameAr), from: a.date, to: a.date, total: 0, marked: 0 };
    cur.from = a.date < cur.from ? a.date : cur.from;
    cur.to = a.date > cur.to ? a.date : cur.to;
    cur.total++;
    if (isMarked(a)) cur.marked++;
    seriesMap.set(k, cur);
  }
  const classes = sections.map((x) => {
    const mine = assessments.filter((a) => a.sectionId === x.id && due(a));
    const c = cards.filter((r) => r.sectionId === x.id);
    return {
      id: x.id,
      label: label.get(x.id) ?? "",
      homeroom: x.homeroom ? pick(locale, x.homeroom.name, x.homeroom.nameAr) : null,
      marked: mine.filter(isMarked).length,
      due: mine.length,
      published: c.find((r) => r.status === "published")?._count._all ?? 0,
      drafts: c.find((r) => r.status === "draft")?._count._all ?? 0,
      students: x._count.students,
      mine: s.homeroomIds.includes(x.id),
    };
  });
  const grades = [...new Map(sections.map((x) => [x.gradeId, { id: x.gradeId, name: pick(locale, x.grade.name, x.grade.nameAr), level: x.grade.level }])).values()].sort((a, b) => a.level - b.level);
  return (
    <ExamsOverview
      slug={slug}
      term={{ id: s.term.id, name: pick(locale, s.term.name, s.term.nameAr) }}
      yearName={s.year.name}
      manage={manage}
      books={books}
      series={[...seriesMap.values()].map((x) => ({ ...x, from: x.from.toISOString(), to: x.to.toISOString() }))}
      classes={manage ? classes : classes.filter((c) => c.mine)}
      grades={grades}
    />
  );
}
