import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { getThread } from "@/lib/thread";
import { attachmentUrl } from "@/lib/attachments";
import { schoolPage } from "@/lib/school/scope";
import { classOptions, stopOptions } from "@/lib/school/options";
import { AdmissionsBoard } from "@/components/school/admissions-board";
import { applicationsDataset } from "@/lib/datasets/school";
import { i18nFor } from "@/lib/biz";

export const metadata: Metadata = { title: "Admissions" };

export default async function AdmissionsPage({ params, searchParams }: PageProps<"/w/[slug]/admissions">) {
  const { slug } = await params;
  const sp = await searchParams;
  const s = await schoolPage(slug, ["school.manage"]);
  await connection();
  const locale = s.ws.viewer.prefs.locale;
  const years = await db.academicYear.findMany({ where: { orgId: s.ws.org.id, endDate: { gte: s.year.startDate } }, orderBy: { startDate: "asc" } });
  // Admissions in the autumn are mostly for next year, so default to it when it exists.
  const next = years.find((y) => y.startDate > s.year.startDate);
  const yearId = typeof sp.year === "string" && years.some((y) => y.id === sp.year) ? sp.year : (next?.id ?? s.year.id);
  const open = typeof sp.open === "string" ? sp.open : null;
  const { t } = await i18nFor(s.ws);
  const [result, apps, grades, classes, stops, selected] = await Promise.all([
    applicationsDataset.load(s.ws, new URLSearchParams({ year: yearId }), { locale, t }),
    db.application.findMany({ where: { orgId: s.ws.org.id, yearId, campusId: { in: s.campusIds } }, include: { grade: true, campus: true }, orderBy: { stageAt: "desc" } }),
    db.grade.findMany({ where: { orgId: s.ws.org.id }, orderBy: { level: "asc" } }),
    classOptions(s, locale),
    stopOptions(s, locale),
    open
      ? db.application.findFirst({ where: { id: open, orgId: s.ws.org.id } }).then(async (a) =>
          a
            ? {
                id: a.id,
                files: (await db.attachment.findMany({ where: { orgId: s.ws.org.id, entityType: "application", entityId: a.id }, orderBy: { createdAt: "desc" } })).map((f) => ({ id: f.id, url: attachmentUrl(slug, f.id), thumb: f.thumbPath ? attachmentUrl(slug, f.id, "thumb") : null, fileName: f.fileName, mimeType: f.mimeType })),
                thread: await getThread(s.ws.org.id, "application", a.id),
              }
            : null,
        )
      : Promise.resolve(null),
  ]);
  const campusList = s.ws.org.campuses.filter((c) => s.campusIds.includes(c.id));
  return (
    <AdmissionsBoard
      slug={slug}
      viewerId={s.ws.viewer.id}
      now={new Date().toISOString()}
      yearId={yearId}
      currentYearId={s.year.id}
      years={years.map((y) => ({ id: y.id, name: y.name }))}
      apps={apps.map((a) => ({
        id: a.id,
        number: a.number,
        childName: a.childName,
        childNameAr: a.childNameAr,
        gender: a.gender,
        dob: a.dob.toISOString().slice(0, 10),
        nationality: a.nationality,
        previousSchool: a.previousSchool,
        guardianName: a.guardianName,
        guardianNameAr: a.guardianNameAr,
        guardianRelation: a.guardianRelation,
        guardianPhone: a.guardianPhone,
        guardianEmail: a.guardianEmail,
        guardianId: a.guardianId,
        stage: a.stage,
        stageAt: a.stageAt.toISOString(),
        assessmentAt: a.assessmentAt?.toISOString() ?? null,
        assessmentScore: a.assessmentScore,
        source: a.source,
        notes: a.notes,
        studentId: a.studentId,
        yearId: a.yearId,
        campusId: a.campusId,
        campus: pick(locale, a.campus.name, a.campus.nameAr),
        campusColor: a.campus.color,
        gradeId: a.gradeId,
        grade: pick(locale, a.grade.name, a.grade.nameAr),
        createdAt: a.createdAt.toISOString(),
      }))}
      grades={grades.map((g) => ({ id: g.id, name: pick(locale, g.name, g.nameAr), level: g.level }))}
      campuses={campusList.map((c) => ({ id: c.id, name: pick(locale, c.name, c.nameAr) }))}
      classes={classes}
      stops={stops}
      selected={selected}
      canShare={s.ws.can("exports.share")}
      result={result}
    />
  );
}
