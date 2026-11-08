import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { getThread } from "@/lib/thread";
import { attachmentUrl } from "@/lib/attachments";
import { canViewStudent } from "@/lib/access";
import { schoolPage } from "@/lib/school/scope";
import { classOptions, stopOptions } from "@/lib/school/options";
import { sectionName } from "@/lib/school/settings";
import { attendanceSummary, publishedReports, studentFees, termResults } from "@/lib/school/profile";
import { StudentDetail } from "@/components/school/student-detail";

export const metadata: Metadata = { title: "Student" };

export default async function StudentPage({ params }: PageProps<"/w/[slug]/students/[id]">) {
  const { slug, id } = await params;
  const s = await schoolPage(slug);
  if (s.ws.can("school.parent") && !s.ws.can("school.manage")) notFound();
  if (!(await canViewStudent(s.ws, id))) notFound();
  await connection();
  const locale = s.ws.viewer.prefs.locale;
  const st = await db.student.findFirst({
    where: { id, orgId: s.ws.org.id },
    include: {
      grade: true,
      campus: true,
      section: { include: { homeroom: { select: { id: true, name: true, nameAr: true } } } },
      busStop: { include: { route: true } },
      guardians: { include: { guardian: { include: { children: { include: { student: { include: { grade: true, section: true } } } } } } }, orderBy: { primary: "desc" } },
      loans: { include: { book: true }, orderBy: { borrowedOn: "desc" }, take: 20 },
    },
  });
  if (!st) notFound();
  const manage = s.ws.can("school.manage");
  const money = manage || s.ws.can("finance.view");
  const [attendance, results, fees, reports, thread, files, classes, stops] = await Promise.all([
    attendanceSummary(st.id, st.sectionId, s.term.startDate, s.term.endDate),
    st.sectionId ? termResults(st.id, st.sectionId, s.term.id, s.settings) : Promise.resolve([]),
    money ? studentFees(s.ws.org.id, st.id) : Promise.resolve(null),
    publishedReports(st.id),
    manage || s.ws.can("school.teach") ? getThread(s.ws.org.id, "student", st.id) : Promise.resolve([]),
    db.attachment.findMany({ where: { orgId: s.ws.org.id, entityType: "student", entityId: st.id }, orderBy: { createdAt: "desc" } }),
    manage ? classOptions(s, locale) : Promise.resolve([]),
    manage ? stopOptions(s, locale) : Promise.resolve([]),
  ]);
  const siblings = new Map<string, { id: string; name: string; className: string }>();
  for (const g of st.guardians) {
    for (const c of g.guardian.children) {
      if (c.studentId === st.id || c.student.status !== "active") continue;
      siblings.set(c.studentId, { id: c.studentId, name: pick(locale, c.student.name, c.student.nameAr), className: c.student.section ? sectionName(locale, c.student.grade, c.student.section.name) : pick(locale, c.student.grade.name, c.student.grade.nameAr) });
    }
  }
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return (
    <StudentDetail
      slug={slug}
      viewerId={s.ws.viewer.id}
      now={new Date().toISOString()}
      student={{
        id: st.id,
        number: st.number,
        name: st.name,
        nameAr: st.nameAr,
        gender: st.gender,
        dob: st.dob.toISOString(),
        nationality: st.nationality,
        qid: st.qid,
        qidExpiry: iso(st.qidExpiry),
        passportNumber: st.passportNumber,
        sectionId: st.sectionId,
        joinedOn: st.joinedOn.toISOString(),
        leftOn: iso(st.leftOn),
        bloodGroup: st.bloodGroup,
        medical: st.medical,
        busStopId: st.busStopId,
        discountKind: st.discountKind,
        discountPct: st.discountPct,
        previousSchool: st.previousSchool,
        notes: st.notes,
        status: st.status,
        avatarColor: st.avatarColor,
        guardians: st.guardians.map((g) => ({ id: g.guardian.id, name: g.guardian.name, relation: g.relation, primary: g.primary })),
      }}
      className={st.section ? sectionName(locale, st.grade, st.section.name) : pick(locale, st.grade.name, st.grade.nameAr)}
      gradeName={pick(locale, st.grade.name, st.grade.nameAr)}
      campusName={pick(locale, st.campus.name, st.campus.nameAr)}
      homeroom={st.section?.homeroom ? pick(locale, st.section.homeroom.name, st.section.homeroom.nameAr) : null}
      bus={st.busStop ? { route: `${st.busStop.route.code} · ${pick(locale, st.busStop.route.name, st.busStop.route.nameAr)}`, stop: pick(locale, st.busStop.name, st.busStop.nameAr), pickup: st.busStop.pickup, dropoff: st.busStop.dropoff, driver: st.busStop.route.driverName, driverPhone: st.busStop.route.driverPhone } : null}
      family={st.guardians.map((g) => ({ id: g.guardian.id, name: pick(locale, g.guardian.name, g.guardian.nameAr), relation: g.relation, primary: g.primary, phone: g.guardian.phone, email: g.guardian.email, employer: g.guardian.employer }))}
      siblings={[...siblings.values()]}
      attendance={attendance}
      termName={pick(locale, s.term.name, s.term.nameAr)}
      results={results}
      reports={reports}
      fees={fees}
      loans={st.loans.map((l) => ({ id: l.id, title: l.book.title, author: l.book.author, borrowedOn: l.borrowedOn.toISOString(), dueOn: l.dueOn.toISOString(), returnedOn: iso(l.returnedOn) }))}
      files={files.map((a) => ({ id: a.id, url: attachmentUrl(slug, a.id), thumb: a.thumbPath ? attachmentUrl(slug, a.id, "thumb") : null, fileName: a.fileName, mimeType: a.mimeType }))}
      thread={thread}
      canManage={manage}
      canComment={manage || s.ws.can("school.teach")}
      classes={classes}
      stops={stops}
    />
  );
}
