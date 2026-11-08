import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { i18nFor, toQuery } from "@/lib/biz";
import { schoolPage, studentScope } from "@/lib/school/scope";
import { classOptions, stopOptions } from "@/lib/school/options";
import { studentsDataset } from "@/lib/datasets/school";
import { StudentsView } from "@/components/school/students-view";

export const metadata: Metadata = { title: "Students" };

export default async function StudentsPage({ params, searchParams }: PageProps<"/w/[slug]/students">) {
  const { slug } = await params;
  const s = await schoolPage(slug, ["school.manage", "school.teach", "finance.view", "transport.manage", "library.manage"]);
  const query = toQuery(await searchParams);
  const { locale, t } = await i18nFor(s.ws);
  await connection();
  const scope = studentScope(s);
  const [result, classes, stops, counts] = await Promise.all([
    studentsDataset.load(s.ws, query, { locale, t }),
    classOptions(s, locale),
    s.ws.can("school.manage") ? stopOptions(s, locale) : Promise.resolve([]),
    Promise.all([
      db.student.count({ where: { ...scope, status: "active" } }),
      db.student.count({ where: { ...scope, status: "active", joinedOn: { gte: s.year.startDate } } }),
      db.student.count({ where: { ...scope, status: "active", medical: { not: null } } }),
      db.student.count({ where: { ...scope, status: "upcoming" } }),
      db.student.count({ where: { ...scope, status: { in: ["withdrawn", "graduated"] } } }),
    ]),
  ]);
  const visibleClasses = s.ws.can("school.manage") || s.ws.can("finance.view") ? classes : classes.filter((c) => s.teachSectionIds.includes(c.id));
  return (
    <StudentsView
      slug={slug}
      query={query.toString()}
      result={result}
      canShare={s.ws.can("exports.share")}
      canManage={s.ws.can("school.manage")}
      counts={{ active: counts[0], new: counts[1], medical: counts[2], upcoming: counts[3], left: counts[4] }}
      classes={visibleClasses}
      stops={stops}
    />
  );
}
