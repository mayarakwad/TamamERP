import type { Metadata } from "next";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { pick } from "@/lib/i18n";
import { bizSettings } from "@/lib/biz";
import { schoolPage } from "@/lib/school/scope";
import { sectionName } from "@/lib/school/settings";
import { dohaWeekday, ymdOf } from "@/lib/hr/ops";
import { attendanceSummary, publishedReports, studentFees, termResults } from "@/lib/school/profile";
import { ChildrenView } from "@/components/school/children";

export const metadata: Metadata = { title: "My children" };

export default async function ChildrenPage({ params }: PageProps<"/w/[slug]/children">) {
  const { slug } = await params;
  const s = await schoolPage(slug, ["school.parent"]);
  await connection();
  const locale = s.ws.viewer.prefs.locale;
  const now = new Date();
  const today = new Date(`${ymdOf(now)}T12:00:00+03:00`);
  const weekday = dohaWeekday(now);
  const schoolDay = s.settings.days.includes(weekday);
  const kids = await db.student.findMany({
    where: { id: { in: s.childIds }, status: { in: ["active", "upcoming"] } },
    include: { grade: true, campus: true, section: { include: { homeroom: { select: { name: true, nameAr: true } } } }, busStop: { include: { route: true } }, loans: { where: { returnedOn: null }, include: { book: true } } },
    orderBy: { dob: "asc" },
  });
  const party = await db.guardian.findFirst({ where: { orgId: s.ws.org.id, userId: s.ws.viewer.id, partyId: { not: null } }, select: { partyId: true } });
  const children = await Promise.all(
    kids.map(async (k) => {
      const [att, results, fees, reports, roll, mark, slots] = await Promise.all([
        attendanceSummary(k.id, k.sectionId, s.term.startDate, s.term.endDate),
        k.sectionId ? termResults(k.id, k.sectionId, s.term.id, s.settings) : Promise.resolve([]),
        studentFees(s.ws.org.id, k.id),
        publishedReports(k.id),
        k.sectionId ? db.attendanceRoll.findUnique({ where: { sectionId_date: { sectionId: k.sectionId, date: today } } }) : Promise.resolve(null),
        db.studentAttendance.findUnique({ where: { studentId_date: { studentId: k.id, date: today } } }),
        k.sectionId ? db.timetableSlot.findMany({ where: { sectionId: k.sectionId }, include: { subject: true, teacher: { select: { name: true, nameAr: true } } } }) : Promise.resolve([]),
      ]);
      return {
        id: k.id,
        name: pick(locale, k.name, k.nameAr),
        plainName: k.name,
        color: k.avatarColor,
        status: k.status,
        className: k.section ? sectionName(locale, k.grade, k.section.name) : pick(locale, k.grade.name, k.grade.nameAr),
        campus: pick(locale, k.campus.name, k.campus.nameAr),
        homeroom: k.section?.homeroom ? pick(locale, k.section.homeroom.name, k.section.homeroom.nameAr) : null,
        today: !schoolDay ? "noSchool" : mark ? mark.status : roll ? "present" : "notTaken",
        attendance: att,
        results,
        fees,
        reports,
        bus: k.busStop ? { route: `${k.busStop.route.code} · ${pick(locale, k.busStop.route.name, k.busStop.route.nameAr)}`, stop: pick(locale, k.busStop.name, k.busStop.nameAr), pickup: k.busStop.pickup, dropoff: k.busStop.dropoff, driver: k.busStop.route.driverName, driverPhone: k.busStop.route.driverPhone, attendant: k.busStop.route.attendantName, attendantPhone: k.busStop.route.attendantPhone, color: k.busStop.route.color } : null,
        loans: k.loans.map((l) => ({ id: l.id, title: l.book.title, due: l.dueOn.toISOString(), overdue: l.dueOn < now })),
        timetable: slots.map((x) => ({ day: x.day, period: x.period, title: pick(locale, x.subject.name, x.subject.nameAr), sub: x.teacher ? pick(locale, x.teacher.name, x.teacher.nameAr) : null, color: x.subject.color })),
      };
    }),
  );
  const sales = bizSettings(s.ws.org).sales ?? {};
  return (
    <ChildrenView
      slug={slug}
      termName={pick(locale, s.term.name, s.term.nameAr)}
      kids={children}
      settings={{ days: s.settings.days, periods: s.settings.periods, breaks: s.settings.breaks }}
      weekday={weekday}
      nowTime={new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Qatar", hour: "2-digit", minute: "2-digit", hour12: false }).format(now)}
      bank={sales.iban ? { name: sales.bankName ?? "", iban: sales.iban } : null}
      partyId={party?.partyId ?? null}
    />
  );
}
