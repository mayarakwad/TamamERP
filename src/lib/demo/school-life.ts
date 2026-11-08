// A term of school life: a roll call every morning for every class (absences
// only are stored), quizzes, assignments and mid-term exams with marks, and
// last year's published report cards for every returning student.

import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { dohaNoon, dohaWeekday, ymdOf } from "../hr/ops";
import { CURRICULUM } from "../school/defaults";
import { bandFor, DEFAULT_SCHOOL_SETTINGS, sectionLabel, sectionLabelAr, stageOf } from "../school/settings";
import { principalLine, suggestComments, type ReportSnapshot } from "../school/report-card";
import type { Rng } from "./random";
import { cid, type SchoolSeedCtx } from "./school";

type Db = PrismaClient | Prisma.TransactionClient;
const DAY = 86400_000;

async function insertMany<T>(rows: T[], fn: (chunk: T[]) => Promise<unknown>, size = 2500) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

/** Normal-ish random number (sum of uniforms). */
const gauss = (r: Rng) => (r.next() + r.next() + r.next() + r.next() - 2) / 0.58;

export async function seedSchoolLife(db: Db, ctx: SchoolSeedCtx, r: Rng) {
  const { orgId, now, year } = ctx;
  const term1 = year.terms[0];
  const today = ymdOf(now);
  const students = ctx.people.students;
  const bySection = new Map<string, typeof students>();
  for (const s of students) bySection.set(s.sectionId, [...(bySection.get(s.sectionId) ?? []), s]);
  const settings = DEFAULT_SCHOOL_SETTINGS;

  // ── School days so far this term ──
  const days: string[] = [];
  for (let t = term1.startDate.getTime(); t <= now.getTime() && t <= term1.endDate.getTime(); t += DAY) {
    const d = new Date(t);
    if (settings.days.includes(dohaWeekday(d))) days.push(ymdOf(d));
  }

  // Each child has a habit: most rarely miss a day, a few often do.
  const habit = new Map(students.map((s) => [s.id, r.chance(0.08) ? 0.1 + r.next() * 0.08 : 0.01 + r.next() * 0.035]));
  // The demo family's children: Ahmed is solid with one weaker subject, Mariam shines.
  const { ahmed, mariam } = ctx.people.almansouri;
  habit.set(ahmed, 0.012);
  habit.set(mariam, 0.008);
  const lateHabit = new Map(students.map((s) => [s.id, r.chance(0.1) ? 0.08 : 0.012]));
  // A handful were off sick for several days last week (the kind of thing a principal asks about).
  const lastWeek = days.filter((d) => d < today).slice(-5);
  const sickLastWeek = new Set(students.filter((s) => s.level >= 1).filter(() => r.chance(0.012)).map((s) => s.id));

  const notTakenToday = new Set([ctx.staff.aishaSectionId, ...ctx.sections.filter((s) => s.campus === "LUS" && s.level === 4).map((s) => s.id), ...ctx.sections.filter((s) => s.campus === "WAB" && s.level === 10).map((s) => s.id)]);
  const aishaSection = ctx.staff.aishaSectionId;
  const rolls: Prisma.AttendanceRollCreateManyInput[] = [];
  const marks: Prisma.StudentAttendanceCreateManyInput[] = [];
  const absenceNotes = ["Fever", "Doctor's appointment", "Family travel", "Stomach bug", "Dentist", null, null, null];
  for (const sec of ctx.sections) {
    const kids = bySection.get(sec.id) ?? [];
    for (const day of days) {
      if (day === today && notTakenToday.has(sec.id)) continue;
      let absent = 0;
      let late = 0;
      let excused = 0;
      for (const k of kids) {
        let status: string | null = null;
        if (sickLastWeek.has(k.id) && lastWeek.slice(1, 5).includes(day) && k.id !== ahmed && k.id !== mariam) status = "absent";
        else if (r.chance(habit.get(k.id)!)) status = r.chance(0.25) ? "excused" : "absent";
        else if (r.chance(lateHabit.get(k.id)!)) status = "late";
        if (!status) continue;
        if (status === "absent") absent++;
        if (status === "late") late++;
        if (status === "excused") excused++;
        marks.push({ id: cid(), orgId, studentId: k.id, sectionId: sec.id, date: dohaNoon(day), status, minutes: status === "late" ? r.pick([5, 10, 12, 15, 20, 25]) : null, note: status === "excused" ? r.pick(["Medical certificate", "Family emergency", "Umrah"]) : status === "absent" ? r.pick(absenceNotes) : null, notifiedAt: status === "absent" ? new Date(dohaNoon(day).getTime() - 3 * 3600_000) : null });
      }
      const taken = new Date(`${day}T07:${String(r.int(16, 42)).padStart(2, "0")}:00+03:00`);
      rolls.push({ id: cid(), orgId, sectionId: sec.id, date: dohaNoon(day), takenById: sec.id === aishaSection ? ctx.users.aisha : "seed", takenAt: taken > now ? now : taken, size: kids.length, absent, late, excused });
    }
  }
  await insertMany(rolls, (c) => db.attendanceRoll.createMany({ data: c }));
  await insertMany(marks, (c) => db.studentAttendance.createMany({ data: c }));

  // ── Assessments and marks ──
  const ability = new Map(students.map((s) => [s.id, Math.max(40, Math.min(98, 78 + gauss(r) * 10))]));
  ability.set(ahmed, 82);
  ability.set(mariam, 91);
  const flair = new Map<string, number>();
  flair.set(`${ahmed}|${ctx.subjectByCode.get("MATH")!.id}`, 5);
  flair.set(`${ahmed}|${ctx.subjectByCode.get("ARB")!.id}`, -9);
  flair.set(`${ahmed}|${ctx.subjectByCode.get("ENG")!.id}`, 2);
  const at = (offsetDays: number, hour = 9) => new Date(term1.startDate.getTime() + offsetDays * DAY + (hour - 12) * 3600_000);
  const plan = (level: number) =>
    level <= 0
      ? [
          { name: "Observation 1", nameAr: "الملاحظة الأولى", kind: "project", day: 31, max: 10, weight: 30 },
          { name: "Observation 2", nameAr: "الملاحظة الثانية", kind: "project", day: 66, max: 10, weight: 30 },
          { name: "End-of-term observation", nameAr: "ملاحظة نهاية الفصل", kind: "project", day: 107, max: 10, weight: 40 },
        ]
      : [
          { name: "Quiz 1", nameAr: "الاختبار القصير 1", kind: "quiz", day: 23, max: 20, weight: 10 },
          { name: "Assignment", nameAr: "الواجب", kind: "assignment", day: 44, max: 25, weight: 15 },
          { name: "Mid-term exam", nameAr: "اختبار منتصف الفصل", kind: "exam", day: 64, max: 50, weight: 30 },
          { name: "Quiz 2", nameAr: "الاختبار القصير 2", kind: "quiz", day: 86, max: 20, weight: 10 },
          { name: "End-of-term exam", nameAr: "اختبار نهاية الفصل", kind: "exam", day: 107, max: 100, weight: 35 },
        ];
  const assessments: Prisma.AssessmentCreateManyInput[] = [];
  const markRows: Prisma.MarkCreateManyInput[] = [];
  const assignments = ctx.staff.assignments;
  const codeOf = new Map(ctx.subjects.map((s) => [s.id, s.code]));
  // A few mid-terms still waiting for marks, including Science in 5-B.
  const science = ctx.subjectByCode.get("SCI")!.id;
  const pendingMidterm = new Set([`${aishaSection}|${science}`, ...assignments.filter((a) => a.sectionId !== aishaSection && r.chance(0.04)).map((a) => `${a.sectionId}|${a.subjectId}`)]);
  for (const a of assignments) {
    const sec = ctx.sections.find((s) => s.id === a.sectionId)!;
    const kids = bySection.get(sec.id) ?? [];
    const spread = (codeOf.get(a.subjectId)!.charCodeAt(0) % 5) - 2;
    for (const p of plan(sec.level)) {
      const id = cid();
      const examDay = p.kind === "exam" && p.day === 64 ? p.day + (a.subjectId.charCodeAt(3) % 7) : p.day + (a.subjectId.charCodeAt(2) % 3);
      const date = at(examDay);
      assessments.push({ id, orgId, termId: term1.id, sectionId: sec.id, subjectId: a.subjectId, name: p.name, nameAr: p.nameAr, kind: p.kind, date, maxScore: p.max, weight: p.weight, createdById: ctx.users.fatima });
      const marked = date.getTime() < now.getTime() - DAY && !(p.name === "Mid-term exam" && pendingMidterm.has(`${sec.id}|${a.subjectId}`));
      if (!marked) continue;
      for (const k of kids) {
        const key = `${k.id}|${a.subjectId}`;
        if (!flair.has(key)) flair.set(key, gauss(r) * 7 + spread);
        if (r.chance(0.015)) {
          markRows.push({ id: cid(), orgId, assessmentId: id, studentId: k.id, score: null, absent: true });
          continue;
        }
        const pct = Math.max(15, Math.min(100, ability.get(k.id)! + flair.get(key)! + gauss(r) * 7));
        const score = Math.round(((pct / 100) * p.max) * 2) / 2;
        markRows.push({ id: cid(), orgId, assessmentId: id, studentId: k.id, score: Math.round(score * 100), absent: false });
      }
    }
  }
  await insertMany(assessments, (c) => db.assessment.createMany({ data: c }));
  await insertMany(markRows, (c) => db.mark.createMany({ data: c }));

  // ── Last year's report cards for everyone who was here ──
  const reports: Prisma.ReportCardCreateManyInput[] = [];
  const campusName = { WAB: ["Al Waab campus", "فرع الوعب"], LUS: ["Lusail campus", "فرع لوسيل"], WAK: ["Al Wakra campus", "فرع الوكرة"] } as const;
  const teachers = ctx.staff.teacherInfo;
  for (const s of students) {
    if (s.joinYear >= ctx.startYear || s.level - 1 < -1) continue;
    const prev = ctx.gradeByLevel.get(s.level - 1)!;
    const sec = ctx.sections.find((x) => x.id === s.sectionId)!;
    const curriculum = CURRICULUM[stageOf(prev.level)];
    const homeroomId = ctx.staff.homeroom.get(sec.id);
    for (const term of ctx.lastYear.terms) {
      const subjects = Object.keys(curriculum).map((code) => {
        const subj = ctx.subjectByCode.get(code)!;
        const pct = Math.round(Math.max(30, Math.min(99, ability.get(s.id)! + (flair.get(`${s.id}|${subj.id}`) ?? gauss(r) * 6) + gauss(r) * 4 - (3 - term.sort))) * 10) / 10;
        return { code, name: subj.name, nameAr: subj.nameAr, percent: pct, letter: bandFor(settings.scale, pct)?.letter ?? null, teacher: null, comment: null };
      });
      const avg = Math.round((subjects.reduce((x, y) => x + y.percent, 0) / subjects.length) * 10) / 10;
      const first = s.name.split(" ")[0];
      const daysInTerm = [56, 52, 50][term.sort - 1];
      const absent = Math.round(daysInTerm * habit.get(s.id)! * (0.7 + r.next() * 0.6));
      const snap: ReportSnapshot = {
        student: { name: s.name, nameAr: s.nameAr, number: s.number, dob: s.dob.toISOString(), gender: s.gender },
        className: sectionLabel(prev, sec.name),
        classNameAr: sectionLabelAr(prev, sec.name),
        grade: prev.name,
        gradeAr: prev.nameAr,
        campus: campusName[s.campus][0],
        campusAr: campusName[s.campus][1],
        year: ctx.lastYear.name,
        term: term.name,
        termAr: term.nameAr,
        homeroom: homeroomId ? (teachers.get(homeroomId)?.name ?? null) : null,
        homeroomAr: null,
        subjects,
        attendance: { days: daysInTerm, absent, late: r.int(0, 3), excused: r.int(0, 2) },
        average: avg,
        teacherComment: r.pick(suggestComments(avg, first, "en", s.gender)),
        principalComment: principalLine(avg, first, "en", s.gender),
        scale: settings.scale,
        passMark: settings.passMark,
      };
      reports.push({ id: cid(), orgId, studentId: s.id, termId: term.id, sectionId: null, status: "published", teacherComment: snap.teacherComment, principalComment: snap.principalComment, snapshot: snap as unknown as Prisma.InputJsonValue, publishedAt: new Date(term.endDate.getTime() + 5 * DAY), publishedById: ctx.users.fatima });
    }
  }
  await insertMany(reports, (c) => db.reportCard.createMany({ data: c }), 500);

  // ── Term 1 report cards for 5-B: the class teacher is halfway through the comments ──
  const fiveB = (bySection.get(aishaSection) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  await db.reportCard.createMany({
    data: fiveB.slice(0, Math.ceil(fiveB.length / 2)).map((s) => ({
      id: cid(),
      orgId,
      studentId: s.id,
      termId: term1.id,
      sectionId: aishaSection,
      status: "draft",
      teacherComment: r.pick(suggestComments(ability.get(s.id)!, s.name.split(" ")[0], "en", s.gender)),
    })),
  });
}
