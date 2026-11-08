import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { schoolPage } from "@/lib/school/scope";
import { planPromotion } from "@/lib/school/rollover";
import { yearPlan } from "@/lib/school/defaults";
import { NewYear } from "@/components/school/new-year";

export const metadata: Metadata = { title: "New school year" };

export default async function NewYearPage({ params }: PageProps<"/w/[slug]/settings/school/new-year">) {
  const { slug } = await params;
  const s = await schoolPage(slug, ["workspace.manage"]);
  if (s.locked) notFound();
  await connection();
  const locale = s.ws.viewer.prefs.locale;
  const orgId = s.ws.org.id;
  const next = await db.academicYear.findFirst({ where: { orgId, startDate: { gt: s.year.startDate } }, orderBy: { startDate: "asc" } });
  const nextName = next?.name ?? yearPlan(s.year.startDate.getUTCFullYear() + 1).name;
  const [grades, sections, students, campuses, nextFees] = await Promise.all([
    db.grade.findMany({ where: { orgId }, orderBy: { level: "asc" } }),
    db.section.findMany({ where: { orgId, yearId: s.year.id }, include: { grade: true } }),
    db.student.findMany({ where: { orgId, status: { in: ["active", "upcoming"] } }, include: { grade: true, section: true } }),
    db.campus.findMany({ where: { orgId }, orderBy: { createdAt: "asc" } }),
    next ? db.feeRate.count({ where: { orgId, yearId: next.id } }) : Promise.resolve(0),
  ]);
  const maxLevel = Math.max(...grades.map((g) => g.level));
  const plan = planPromotion(
    students.map((x) => ({ id: x.id, campusId: x.campusId, level: x.grade.level, letter: x.section?.name ?? null, status: x.status as "active" | "upcoming" })),
    sections.map((x) => ({ key: x.id, campusId: x.campusId, level: x.grade.level, letter: x.name, capacity: x.capacity })),
    maxLevel,
    campuses.map((c) => c.id),
  );
  const byGrade = grades.map((g) => ({
    name: pick(locale, g.name, g.nameAr),
    now: students.filter((x) => x.status === "active" && x.grade.level === g.level).length,
    next: plan.filter((p) => p.to?.level === g.level).length,
  }));
  return (
    <NewYear
      slug={slug}
      from={s.year.name}
      to={nextName}
      counts={{
        promote: plan.filter((p) => p.to && students.find((x) => x.id === p.studentId)?.status === "active").length,
        graduate: plan.filter((p) => !p.to).length,
        join: students.filter((x) => x.status === "upcoming").length,
        transfer: plan.filter((p) => p.transfer).length,
        classes: sections.length,
      }}
      byGrade={byGrade}
      feesSet={nextFees > 0}
    />
  );
}
