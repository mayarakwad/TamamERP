import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { schoolPage } from "@/lib/school/scope";
import { FeeStructure } from "@/components/school/fee-structure";

export const metadata: Metadata = { title: "Fee structure" };

export default async function FeeStructurePage({ params, searchParams }: PageProps<"/w/[slug]/fees/structure">) {
  const { slug } = await params;
  const sp = await searchParams;
  const s = await schoolPage(slug, ["finance.view", "school.manage"]);
  await connection();
  const locale = s.ws.viewer.prefs.locale;
  const years = await db.academicYear.findMany({ where: { orgId: s.ws.org.id, endDate: { gte: s.year.startDate } }, orderBy: { startDate: "asc" } });
  const yearId = typeof sp.year === "string" && years.some((y) => y.id === sp.year) ? sp.year : s.year.id;
  const [grades, rates, counts] = await Promise.all([
    db.grade.findMany({ where: { orgId: s.ws.org.id }, orderBy: { level: "asc" } }),
    db.feeRate.findMany({ where: { orgId: s.ws.org.id, yearId } }),
    db.student.groupBy({ by: ["gradeId"], where: { orgId: s.ws.org.id, status: "active", campusId: { in: s.campusIds } }, _count: { _all: true } }),
  ]);
  return (
    <FeeStructure
      slug={slug}
      yearId={yearId}
      years={years.map((y) => ({ id: y.id, name: y.name }))}
      grades={grades.map((g) => ({ id: g.id, name: pick(locale, g.name, g.nameAr), students: counts.find((c) => c.gradeId === g.id)?._count._all ?? 0 }))}
      rates={rates.map((r) => ({ gradeId: r.gradeId, component: r.component, amount: r.amount }))}
      installments={s.settings.installments.map((i) => ({ label: pick(locale, i.label, i.labelAr), pct: i.pct }))}
      canEdit={s.ws.can("finance.manage") || s.ws.can("school.manage")}
    />
  );
}
