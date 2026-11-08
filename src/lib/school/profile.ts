import "server-only";
import { db } from "../db";
import { termPercent } from "./grading";
import { bandFor, type SchoolSettings } from "./settings";

const DAY = 86400_000;

export interface AttendanceSummary {
  days: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  rate: number | null;
  exceptions: { date: string; status: string; minutes: number | null; note: string | null }[];
}

/** Days on the roll this term, from the class's roll calls (absences are the only rows stored). */
export async function attendanceSummary(studentId: string, sectionId: string | null, from: Date, to: Date): Promise<AttendanceSummary> {
  const until = new Date(Math.min(to.getTime() + DAY, Date.now() + DAY));
  const [rolls, rows] = await Promise.all([
    sectionId ? db.attendanceRoll.count({ where: { sectionId, date: { gte: from, lt: until } } }) : Promise.resolve(0),
    db.studentAttendance.findMany({ where: { studentId, date: { gte: from, lt: until } }, orderBy: { date: "desc" } }),
  ]);
  const absent = rows.filter((r) => r.status === "absent").length;
  const excused = rows.filter((r) => r.status === "excused").length;
  const late = rows.filter((r) => r.status === "late").length;
  const days = Math.max(rolls, absent + excused + late);
  return {
    days,
    present: days - absent - excused,
    absent,
    late,
    excused,
    rate: days ? (days - absent - excused) / days : null,
    exceptions: rows.map((r) => ({ date: r.date.toISOString(), status: r.status, minutes: r.minutes, note: r.note })),
  };
}

export interface SubjectResult {
  subjectId: string;
  code: string;
  name: string;
  nameAr: string | null;
  color: string | null;
  teacher: string | null;
  percent: number | null;
  letter: string | null;
  label: string | null;
  labelAr: string | null;
  classAverage: number | null;
  assessments: { id: string; name: string; nameAr: string | null; kind: string; date: string; max: number; weight: number; score: number | null; absent: boolean }[];
}

/** Term results by subject for one student, with the class average for comparison. */
export async function termResults(studentId: string, sectionId: string, termId: string, settings: SchoolSettings): Promise<SubjectResult[]> {
  const [assignments, assessments] = await Promise.all([
    db.teachingAssignment.findMany({ where: { sectionId }, include: { subject: true, teacher: { select: { name: true } } }, orderBy: { subject: { sort: "asc" } } }),
    db.assessment.findMany({ where: { sectionId, termId }, include: { marks: true }, orderBy: { date: "asc" } }),
  ]);
  const studentsInClass = [...new Set(assessments.flatMap((a) => a.marks.map((m) => m.studentId)))];
  return assignments.map((a) => {
    const mine = assessments.filter((x) => x.subjectId === a.subjectId);
    const lite = mine.map((x) => ({ id: x.id, maxScore: x.maxScore, weight: x.weight }));
    const marksFor = (sid: string) => mine.flatMap((x) => x.marks.filter((m) => m.studentId === sid).map((m) => ({ assessmentId: x.id, score: m.score, absent: m.absent })));
    const percent = termPercent(lite, marksFor(studentId));
    const others = studentsInClass.map((sid) => termPercent(lite, marksFor(sid))).filter((x): x is number => x != null);
    const band = bandFor(settings.scale, percent);
    return {
      subjectId: a.subjectId,
      code: a.subject.code,
      name: a.subject.name,
      nameAr: a.subject.nameAr,
      color: a.subject.color,
      teacher: a.teacher?.name ?? null,
      percent,
      letter: band?.letter ?? null,
      label: band?.label ?? null,
      labelAr: band?.labelAr ?? null,
      classAverage: others.length ? Math.round((others.reduce((s, x) => s + x, 0) / others.length) * 10) / 10 : null,
      assessments: mine.map((x) => {
        const m = x.marks.find((mm) => mm.studentId === studentId);
        return { id: x.id, name: x.name, nameAr: x.nameAr, kind: x.kind, date: x.date.toISOString(), max: x.maxScore, weight: x.weight, score: m?.score ?? null, absent: m?.absent ?? false };
      }),
    };
  });
}

/** Fee invoices for a student and what's still owed. */
export async function studentFees(orgId: string, studentId: string) {
  const docs = await db.document.findMany({
    where: { orgId, studentId, kind: "fee", status: { not: "draft" } },
    orderBy: { date: "desc" },
    include: { allocations: { include: { payment: { select: { number: true, date: true, method: true, voidedAt: true } } } } },
  });
  const now = Date.now();
  return {
    invoices: docs.map((d) => ({
      id: d.id,
      number: d.number,
      date: d.date.toISOString(),
      due: d.dueDate?.toISOString() ?? null,
      total: d.total,
      paid: d.paid,
      installment: d.installment,
      status: d.status === "void" ? "void" : d.status !== "paid" && d.dueDate && d.dueDate.getTime() < now ? "overdue" : d.status,
    })),
    balance: docs.filter((d) => d.status === "issued" || d.status === "partial").reduce((s, d) => s + d.total - d.paid, 0),
    overdue: docs.filter((d) => (d.status === "issued" || d.status === "partial") && d.dueDate && d.dueDate.getTime() < now).reduce((s, d) => s + d.total - d.paid, 0),
    payments: docs
      .flatMap((d) => d.allocations.filter((a) => !a.payment.voidedAt).map((a) => ({ number: a.payment.number, date: a.payment.date.toISOString(), method: a.payment.method, amount: a.amount, invoice: d.number })))
      .sort((a, b) => b.date.localeCompare(a.date)),
  };
}

/** Published report cards, newest first. */
export async function publishedReports(studentId: string) {
  const rows = await db.reportCard.findMany({ where: { studentId, status: "published" }, include: { term: { include: { year: true } } }, orderBy: [{ term: { startDate: "desc" } }] });
  return rows.map((r) => ({ id: r.id, term: r.term.name, termAr: r.term.nameAr, year: r.term.year.name, publishedAt: r.publishedAt?.toISOString() ?? null }));
}
