// Starting a new school year in place: classes carry over with their teachers
// (and timetables if wanted), everyone moves up a grade, the oldest graduate,
// children enrolled for next year join their classes, and fees copy forward.
// The plan is a pure function (unit-tested); `rollover` applies it.

import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { createYear } from "./defaults";

type Db = PrismaClient | Prisma.TransactionClient;

export interface PlanStudent {
  id: string;
  campusId: string;
  level: number;
  /** Letter of the current class ("B"), to keep friends together */
  letter: string | null;
  status: "active" | "upcoming";
}

export interface PlanSection {
  key: string;
  campusId: string;
  level: number;
  letter: string;
  capacity: number;
}

export interface Promotion {
  studentId: string;
  /** null = graduates */
  to: { campusId: string; level: number; sectionKey: string | null } | null;
  /** Moved to another campus because theirs doesn't run the next grade */
  transfer: boolean;
}

/**
 * Where each student goes next year. Same campus and same class letter when
 * possible; otherwise the emptiest class of that grade; otherwise the first
 * campus that runs the grade. Children joining (upcoming) keep their grade.
 */
export function planPromotion(students: PlanStudent[], nextSections: PlanSection[], maxLevel: number, campusOrder: string[]): Promotion[] {
  const fill = new Map(nextSections.map((s) => [s.key, 0]));
  const out: Promotion[] = [];
  const sorted = [...students].sort((a, b) => (a.status === b.status ? 0 : a.status === "active" ? -1 : 1));
  for (const st of sorted) {
    const level = st.status === "upcoming" ? st.level : st.level + 1;
    if (level > maxLevel) {
      out.push({ studentId: st.id, to: null, transfer: false });
      continue;
    }
    const campuses = [st.campusId, ...campusOrder.filter((c) => c !== st.campusId)];
    let placed: Promotion | null = null;
    for (const campusId of campuses) {
      const options = nextSections.filter((s) => s.campusId === campusId && s.level === level);
      if (!options.length) continue;
      const same = options.find((s) => s.letter === st.letter && fill.get(s.key)! < s.capacity);
      const emptiest = [...options].sort((a, b) => fill.get(a.key)! / a.capacity - fill.get(b.key)! / b.capacity)[0];
      const target = same ?? emptiest;
      fill.set(target.key, fill.get(target.key)! + 1);
      placed = { studentId: st.id, to: { campusId, level, sectionKey: target.key }, transfer: campusId !== st.campusId };
      break;
    }
    out.push(placed ?? { studentId: st.id, to: { campusId: st.campusId, level, sectionKey: null }, transfer: false });
  }
  return out;
}

/** Apply the new year. Call inside one transaction. */
export async function rollover(db: Db, orgId: string, userId: string, opts: { copyTimetables: boolean; feeIncreasePct: number }) {
  const current = await db.academicYear.findFirstOrThrow({ where: { orgId, current: true } });
  const startYear = current.startDate.getUTCFullYear() + (current.startDate.getUTCMonth() >= 6 ? 0 : -1);
  let next = await db.academicYear.findFirst({ where: { orgId, startDate: { gt: current.startDate } }, orderBy: { startDate: "asc" }, include: { terms: true } });
  if (!next) next = await createYear(db, orgId, startYear + 1, false);
  const [grades, sections, campuses] = await Promise.all([
    db.grade.findMany({ where: { orgId }, orderBy: { level: "asc" } }),
    db.section.findMany({ where: { orgId, yearId: current.id }, include: { grade: true, assignments: true, slots: true } }),
    db.campus.findMany({ where: { orgId }, orderBy: { createdAt: "asc" } }),
  ]);
  const gradeByLevel = new Map(grades.map((g) => [g.level, g]));
  const maxLevel = Math.max(...grades.map((g) => g.level));

  // Classes for next year: the same ones, with their teachers.
  const existing = await db.section.findMany({ where: { orgId, yearId: next.id }, include: { grade: true } });
  const keyOf = (campusId: string, level: number, letter: string) => `${campusId}|${level}|${letter}`;
  const nextIds = new Map(existing.map((s) => [keyOf(s.campusId, s.grade.level, s.name), s.id]));
  for (const s of sections) {
    const k = keyOf(s.campusId, s.grade.level, s.name);
    if (nextIds.has(k)) continue;
    const created = await db.section.create({ data: { orgId, yearId: next.id, campusId: s.campusId, gradeId: s.gradeId, name: s.name, room: s.room, capacity: s.capacity, homeroomId: s.homeroomId } });
    nextIds.set(k, created.id);
    if (s.assignments.length) await db.teachingAssignment.createMany({ data: s.assignments.map((a) => ({ orgId, sectionId: created.id, subjectId: a.subjectId, teacherId: a.teacherId, periods: a.periods })) });
    if (opts.copyTimetables && s.slots.length) await db.timetableSlot.createMany({ data: s.slots.map((x) => ({ orgId, sectionId: created.id, day: x.day, period: x.period, subjectId: x.subjectId, teacherId: x.teacherId, room: x.room })) });
  }
  const nextSections: PlanSection[] = sections.map((s) => ({ key: keyOf(s.campusId, s.grade.level, s.name), campusId: s.campusId, level: s.grade.level, letter: s.name, capacity: s.capacity }));
  for (const e of existing) nextSections.push({ key: keyOf(e.campusId, e.grade.level, e.name), campusId: e.campusId, level: e.grade.level, letter: e.name, capacity: e.capacity });

  const students = await db.student.findMany({ where: { orgId, status: { in: ["active", "upcoming"] } }, include: { grade: true, section: true } });
  const plan = planPromotion(
    students.map((s) => ({ id: s.id, campusId: s.campusId, level: s.grade.level, letter: s.section?.name ?? null, status: s.status as "active" | "upcoming" })),
    nextSections,
    maxLevel,
    campuses.map((c) => c.id),
  );
  let promoted = 0;
  let graduated = 0;
  let transferred = 0;
  for (const p of plan) {
    if (!p.to) {
      await db.student.update({ where: { id: p.studentId }, data: { status: "graduated", sectionId: null, leftOn: current.endDate, busStopId: null } });
      graduated++;
      continue;
    }
    const grade = gradeByLevel.get(p.to.level)!;
    await db.student.update({ where: { id: p.studentId }, data: { status: "active", campusId: p.to.campusId, gradeId: grade.id, sectionId: p.to.sectionKey ? (nextIds.get(p.to.sectionKey) ?? null) : null } });
    promoted++;
    if (p.transfer) transferred++;
  }

  // Fees: copy forward if next year has none yet.
  if (!(await db.feeRate.count({ where: { orgId, yearId: next.id } }))) {
    const rates = await db.feeRate.findMany({ where: { orgId, yearId: current.id } });
    if (rates.length) {
      await db.feeRate.createMany({ data: rates.map((r) => ({ orgId, yearId: next!.id, gradeId: r.gradeId, component: r.component, amount: r.component === "tuition" ? Math.round((r.amount * (1 + opts.feeIncreasePct / 100)) / 5000) * 5000 : r.amount })) });
    }
  }
  await db.academicYear.update({ where: { id: current.id }, data: { current: false } });
  await db.academicYear.update({ where: { id: next.id }, data: { current: true } });
  void userId;
  return { year: next.name, promoted, graduated, transferred, classes: nextIds.size };
}
