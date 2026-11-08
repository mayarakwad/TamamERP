import type { Metadata } from "next";
import { db } from "@/lib/db";
import { schoolPage } from "@/lib/school/scope";
import { SchoolSetupView } from "@/components/school/setup-view";

export const metadata: Metadata = { title: "School setup" };

export default async function SchoolSetupPage({ params }: PageProps<"/w/[slug]/settings/school">) {
  const { slug } = await params;
  const s = await schoolPage(slug, ["school.manage"]);
  const subjects = await db.subject.findMany({ where: { orgId: s.ws.org.id }, orderBy: [{ sort: "asc" }, { name: "asc" }], include: { _count: { select: { assignments: true } } } });
  const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(d);
  return (
    <SchoolSetupView
      slug={slug}
      yearName={s.year.name}
      terms={s.year.terms.map((t) => ({ id: t.id, name: t.name, nameAr: t.nameAr, start: ymd(t.startDate), end: ymd(t.endDate) }))}
      subjects={subjects.map((x) => ({ id: x.id, code: x.code, name: x.name, nameAr: x.nameAr, color: x.color ?? "#4B3FA8", classes: x._count.assignments }))}
      settings={s.settings}
      canEdit={s.ws.can("workspace.manage")}
    />
  );
}
