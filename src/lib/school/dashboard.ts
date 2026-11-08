import "server-only";
import { db } from "../db";
import { pick } from "../i18n";
import { dohaWeekday, ymdOf } from "../hr/ops";
import { leaveBalance } from "../hr/ops";
import { announcementScope } from "./announcements";
import { sectionName } from "./settings";
import type { School } from "./scope";

const DAY = 86400_000;

export type SchoolBriefKind = "roll" | "bus" | "fees" | "applications" | "birthday" | "absent" | "doc" | "marks" | "comments" | "child" | "good";

export async function getSchoolDashboard(s: School, now = new Date()) {
  const locale = s.ws.viewer.prefs.locale;
  const orgId = s.ws.org.id;
  const today = new Date(`${ymdOf(now)}T12:00:00+03:00`);
  const schoolDay = s.settings.days.includes(dohaWeekday(now));
  const office = s.ws.can("school.manage");
  const money = s.ws.can("finance.view") || office;
  const brief: { kind: SchoolBriefKind; vars: Record<string, string | number>; href?: string }[] = [];
  const nowTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Qatar", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);

  // ── The office ──
  let kpis: { students: number; attendance: number | null; rollsTaken: number; sections: number; collected: number; billed: number; overdue: number; applications: number; staff: number } | null = null;
  let trend: { date: string; rate: number }[] = [];
  let byGrade: { name: string; count: number }[] = [];
  let campuses: { id: string; name: string; color: string | null; students: number; capacity: number; attendance: number | null; collected: number; billed: number; staff: number }[] = [];
  if (office || money) {
    const campusFilter = { campusId: { in: s.campusIds } };
    const [students, sections, rollsToday, docs, apps, staff, grades, recentRolls] = await Promise.all([
      db.student.findMany({ where: { orgId, status: "active", ...campusFilter }, select: { id: true, gradeId: true, campusId: true, dob: true, name: true, nameAr: true, qidExpiry: true } }),
      db.section.findMany({ where: { orgId, yearId: s.year.id, ...campusFilter }, include: { grade: true } }),
      db.attendanceRoll.findMany({ where: { orgId, date: today, section: campusFilter } }),
      money ? db.document.findMany({ where: { orgId, kind: "fee", status: { notIn: ["draft", "void"] }, installment: { startsWith: `${s.year.name}/` }, student: campusFilter }, select: { total: true, paid: true, dueDate: true, status: true, partyId: true, campusId: true } }) : Promise.resolve([]),
      db.application.count({ where: { orgId, stage: { in: ["applied", "assessment", "offered"] }, ...campusFilter } }),
      db.employee.findMany({ where: { orgId, status: "active" }, select: { campusId: true } }),
      db.grade.findMany({ where: { orgId }, orderBy: { level: "asc" } }),
      db.attendanceRoll.findMany({ where: { orgId, date: { gte: new Date(today.getTime() - 40 * DAY), lte: today }, section: campusFilter }, select: { date: true, size: true, absent: true, excused: true } }),
    ]);
    const onRoll = rollsToday.reduce((x, r) => x + r.size, 0);
    const away = rollsToday.reduce((x, r) => x + r.absent + r.excused, 0);
    const overdueDocs = docs.filter((d) => (d.status === "issued" || d.status === "partial") && d.dueDate && d.dueDate < now);
    kpis = {
      students: students.length,
      attendance: onRoll ? (onRoll - away) / onRoll : null,
      rollsTaken: rollsToday.length,
      sections: sections.length,
      collected: docs.reduce((x, d) => x + d.paid, 0),
      billed: docs.reduce((x, d) => x + d.total, 0),
      overdue: overdueDocs.reduce((x, d) => x + d.total - d.paid, 0),
      applications: apps,
      staff: staff.filter((e) => !e.campusId || s.campusIds.includes(e.campusId)).length,
    };
    const byDay = new Map<string, { size: number; away: number }>();
    for (const r of recentRolls) {
      const k = ymdOf(r.date);
      const cur = byDay.get(k) ?? { size: 0, away: 0 };
      cur.size += r.size;
      cur.away += r.absent + r.excused;
      byDay.set(k, cur);
    }
    trend = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-20).map(([date, v]) => ({ date, rate: v.size ? (v.size - v.away) / v.size : 0 }));
    byGrade = grades.map((g) => ({ name: pick(locale, g.name, g.nameAr).replace(/^Grade /, "G").replace(/^الصف /, ""), count: students.filter((x) => x.gradeId === g.id).length })).filter((g) => g.count > 0);
    if (s.ws.org.campuses.length > 1 && !s.campus) {
      campuses = s.ws.org.campuses.map((c) => {
        const secs = sections.filter((x) => x.campusId === c.id);
        const rolls = rollsToday.filter((r) => secs.some((x) => x.id === r.sectionId));
        const size = rolls.reduce((x, r) => x + r.size, 0);
        const off = rolls.reduce((x, r) => x + r.absent + r.excused, 0);
        const mine = docs.filter((d) => d.campusId === c.id);
        return { id: c.id, name: pick(locale, c.name, c.nameAr), color: c.color, students: students.filter((x) => x.campusId === c.id).length, capacity: secs.reduce((x, y) => x + y.capacity, 0), attendance: size ? (size - off) / size : null, collected: mine.reduce((x, d) => x + d.paid, 0), billed: mine.reduce((x, d) => x + d.total, 0), staff: staff.filter((e) => e.campusId === c.id).length };
      });
    }

    // ── Briefing ──
    if (office && schoolDay && nowTime >= s.settings.rollBy) {
      const missing = sections.filter((x) => !rollsToday.some((r) => r.sectionId === x.id));
      if (missing.length) brief.push({ kind: "roll", vars: { count: missing.length, first: sectionName(locale, missing[0].grade, missing[0].name), rest: missing.slice(1, 3).map((x) => sectionName(locale, x.grade, x.name)).join(", ") }, href: "attendance" });
    } else if (office && schoolDay) {
      const missing = sections.filter((x) => !rollsToday.some((r) => r.sectionId === x.id));
      if (missing.length && missing.length < sections.length) brief.push({ kind: "roll", vars: { count: missing.length, first: sectionName(locale, missing[0].grade, missing[0].name), rest: missing.slice(1, 3).map((x) => sectionName(locale, x.grade, x.name)).join(", ") }, href: "attendance" });
    }
    if (office) {
      const routes = await db.busRoute.findMany({ where: { orgId, ...campusFilter }, include: { stops: { include: { _count: { select: { students: { where: { status: "active" } } } } } } } });
      const full = routes.filter((r) => r.stops.reduce((x, st) => x + st._count.students, 0) >= r.capacity);
      if (full.length) brief.push({ kind: "bus", vars: { name: full.map((r) => r.code).join(", "), count: full.length }, href: `transport/${full[0].id}` });
    }
    if (money && overdueDocs.length) brief.push({ kind: "fees", vars: { count: new Set(overdueDocs.map((d) => d.partyId)).size, amount: overdueDocs.reduce((x, d) => x + d.total - d.paid, 0) }, href: "fees/invoices?status=overdue" });
    if (office) {
      const fresh = await db.application.count({ where: { orgId, stage: "applied", createdAt: { gte: new Date(now.getTime() - 7 * DAY) }, ...campusFilter } });
      if (fresh) brief.push({ kind: "applications", vars: { count: fresh }, href: "admissions" });
      const md = ymdOf(now).slice(5);
      const birthdays = students.filter((x) => ymdOf(x.dob).slice(5) === md);
      if (birthdays.length) brief.push({ kind: "birthday", vars: { count: birthdays.length, first: pick(locale, birthdays[0].name, birthdays[0].nameAr).split(" ")[0] } });
      const soon = students.filter((x) => x.qidExpiry && x.qidExpiry > now && x.qidExpiry < new Date(now.getTime() + 30 * DAY));
      if (soon.length) brief.push({ kind: "doc", vars: { count: soon.length }, href: "students" });
    }
  }

  // ── Waiting for this person ──
  const waiting: { key: string; count: number; href: string }[] = [];
  if (office) {
    const [applied, leave, claims, drafts] = await Promise.all([
      db.application.count({ where: { orgId, stage: "applied", campusId: { in: s.campusIds } } }),
      db.leaveRequest.count({ where: { orgId, status: "submitted" } }),
      db.claim.count({ where: { orgId, status: "submitted", deletedAt: null } }),
      db.reportCard.count({ where: { orgId, termId: s.term.id, status: "draft", teacherComment: { not: null }, section: { campusId: { in: s.campusIds } } } }),
    ]);
    if (applied) waiting.push({ key: "applications", count: applied, href: "admissions" });
    if (leave) waiting.push({ key: "leave", count: leave, href: "hr/leave?status=submitted" });
    if (claims) waiting.push({ key: "claims", count: claims, href: "claims?status=submitted" });
    if (drafts) waiting.push({ key: "reports", count: drafts, href: "exams" });
  }

  // ── A teacher's day ──
  let teacher: { lessons: { period: number; start: string; end: string; subject: string; color: string | null; className: string; sectionId: string; room: string | null }[]; homeroom: { id: string; label: string; taken: boolean; absent: number } | null; toMark: { sectionId: string; subjectId: string; label: string; name: string; date: string }[]; comments: { done: number; total: number } | null } | null = null;
  if (s.employee && s.teachSectionIds.length) {
    const weekday = dohaWeekday(now);
    const [slots, assessments] = await Promise.all([
      db.timetableSlot.findMany({ where: { teacherId: s.employee.id, day: weekday, section: { yearId: s.year.id } }, include: { subject: true, section: { include: { grade: true } } }, orderBy: { period: "asc" } }),
      db.assessment.findMany({ where: { termId: s.term.id, date: { lt: now }, section: { yearId: s.year.id }, subject: { assignments: { some: { teacherId: s.employee.id } } } }, include: { _count: { select: { marks: true } }, subject: true, section: { include: { grade: true, _count: { select: { students: { where: { status: "active" } } } } } } } }),
    ]);
    const mineAssess = assessments.filter((a) => s.teachSectionIds.includes(a.sectionId));
    // Only assessments for subjects this teacher actually teaches in that class.
    const assigned = await db.teachingAssignment.findMany({ where: { teacherId: s.employee.id }, select: { sectionId: true, subjectId: true } });
    const toMark = mineAssess.filter((a) => assigned.some((x) => x.sectionId === a.sectionId && x.subjectId === a.subjectId) && a._count.marks < Math.max(1, Math.floor(a.section._count.students * 0.8)));
    const home = s.homeroomIds[0] ? await db.section.findUnique({ where: { id: s.homeroomIds[0] }, include: { grade: true, rolls: { where: { date: today } } } }) : null;
    const cards = home ? await db.reportCard.findMany({ where: { termId: s.term.id, sectionId: home.id } }) : [];
    const homeSize = home ? await db.student.count({ where: { sectionId: home.id, status: "active" } }) : 0;
    teacher = {
      lessons: slots.map((x) => ({ period: x.period, start: s.settings.periods[x.period - 1]?.start ?? "", end: s.settings.periods[x.period - 1]?.end ?? "", subject: pick(locale, x.subject.name, x.subject.nameAr), color: x.subject.color, className: sectionName(locale, x.section.grade, x.section.name), sectionId: x.sectionId, room: x.section.room })),
      homeroom: home ? { id: home.id, label: sectionName(locale, home.grade, home.name), taken: home.rolls.length > 0, absent: home.rolls[0]?.absent ?? 0 } : null,
      toMark: toMark.slice(0, 6).map((a) => ({ sectionId: a.sectionId, subjectId: a.subjectId, label: `${sectionName(locale, a.section.grade, a.section.name)} · ${pick(locale, a.subject.name, a.subject.nameAr)}`, name: pick(locale, a.name, a.nameAr), date: a.date.toISOString() })),
      comments: home ? { done: cards.filter((c) => c.teacherComment).length, total: homeSize } : null,
    };
    if (home && schoolDay && !home.rolls.length) brief.push({ kind: "roll", vars: { count: 1, first: sectionName(locale, home.grade, home.name), rest: "" }, href: `attendance?section=${home.id}` });
    if (toMark.length) brief.push({ kind: "marks", vars: { count: toMark.length, name: pick(locale, toMark[0].name, toMark[0].nameAr), className: sectionName(locale, toMark[0].section.grade, toMark[0].section.name) }, href: `exams/gradebook?section=${toMark[0].sectionId}&subject=${toMark[0].subjectId}` });
    if (teacher.comments && teacher.comments.done < teacher.comments.total) brief.push({ kind: "comments", vars: { done: teacher.comments.done, total: teacher.comments.total }, href: `exams/report-cards?section=${home!.id}` });
  }

  // ── Me (check-in, leave) for anyone on staff ──
  let me: { employeeId: string; checkIn: string | null; checkOut: string | null; leaveLeft: number } | null = null;
  if (s.employee) {
    const [day, bal] = await Promise.all([db.attendanceDay.findUnique({ where: { employeeId_date: { employeeId: s.employee.id, date: today } } }), leaveBalance(db, s.employee, now)]);
    me = { employeeId: s.employee.id, checkIn: day?.checkIn ?? null, checkOut: day?.checkOut ?? null, leaveLeft: bal.remaining };
  }

  // ── Parents: their children at a glance ──
  let children: { id: string; name: string; plainName: string; color: string | null; className: string; today: string; due: number; overdue: number; nextLesson: { subject: string; time: string } | null }[] | null = null;
  if (s.ws.can("school.parent") && s.childIds.length) {
    const kids = await db.student.findMany({ where: { id: { in: s.childIds }, status: "active" }, include: { grade: true, section: true }, orderBy: { dob: "asc" } });
    const weekday = dohaWeekday(now);
    children = await Promise.all(
      kids.map(async (k) => {
        const [roll, mark, docs, slots] = await Promise.all([
          k.sectionId ? db.attendanceRoll.findUnique({ where: { sectionId_date: { sectionId: k.sectionId, date: today } } }) : null,
          db.studentAttendance.findUnique({ where: { studentId_date: { studentId: k.id, date: today } } }),
          db.document.findMany({ where: { orgId, kind: "fee", studentId: k.id, status: { in: ["issued", "partial"] } }, select: { total: true, paid: true, dueDate: true } }),
          k.sectionId ? db.timetableSlot.findMany({ where: { sectionId: k.sectionId, day: weekday }, include: { subject: true }, orderBy: { period: "asc" } }) : [],
        ]);
        const next = slots.find((x) => (s.settings.periods[x.period - 1]?.start ?? "") > nowTime);
        const status = !schoolDay ? "noSchool" : mark ? mark.status : roll ? "present" : "notTaken";
        if (mark?.status === "absent") brief.push({ kind: "child", vars: { name: pick(locale, k.name, k.nameAr).split(" ")[0] }, href: "children" });
        return {
          id: k.id,
          name: pick(locale, k.name, k.nameAr),
          plainName: k.name,
          color: k.avatarColor,
          className: k.section ? sectionName(locale, k.grade, k.section.name) : pick(locale, k.grade.name, k.grade.nameAr),
          today: status,
          due: docs.reduce((x, d) => x + d.total - d.paid, 0),
          overdue: docs.filter((d) => d.dueDate && d.dueDate < now).reduce((x, d) => x + d.total - d.paid, 0),
          nextLesson: next ? { subject: pick(locale, next.subject.name, next.subject.nameAr), time: s.settings.periods[next.period - 1].start } : null,
        };
      }),
    );
    const fees = children.reduce((x, c) => x + c.overdue, 0);
    if (fees) brief.push({ kind: "fees", vars: { count: 1, amount: fees }, href: "children" });
  }

  const announcements = (await db.announcement.findMany({ where: await announcementScope(s), orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }], take: 3 })).map((a) => ({ id: a.id, title: pick(locale, a.title, a.titleAr), body: pick(locale, a.body, a.bodyAr), pinned: a.pinned, publishedAt: a.publishedAt.toISOString() }));

  if (!brief.length) brief.push({ kind: "good", vars: {} });
  return { schoolDay, kpis, trend, byGrade, campuses, brief, waiting, teacher, me, children, announcements, termName: pick(locale, s.term.name, s.term.nameAr), yearName: s.year.name };
}

export type SchoolDashboardData = Awaited<ReturnType<typeof getSchoolDashboard>>;
