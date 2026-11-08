"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DocError } from "@/lib/docs/ops";
import { notify } from "@/lib/notify";
import { canTeach, getSchool, type School } from "@/lib/school/scope";
import { sectionLabel, sectionLabelAr } from "@/lib/school/settings";
import { CORE_SUBJECTS, CURRICULUM } from "@/lib/school/defaults";
import { stageOf } from "@/lib/school/settings";
import { autoFill, clashesFor } from "@/lib/school/timetable";
import type { ActionResult } from "./claims";

const dohaNoon = (ymd: string) => new Date(`${ymd}T12:00:00+03:00`);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function attempt<R extends ActionResult<object>>(fn: () => Promise<R>): Promise<R | { ok: false; error: string }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DocError) return { ok: false, error: e.code };
    throw e;
  }
}

async function manager(slug: string) {
  const s = await getSchool(slug);
  if (!s.ws.can("school.manage")) throw new DocError("empty.notAllowed");
  return s;
}

const log = (s: School, action: string, entityType: string, entityId: string, summary: string, summaryAr: string) => audit({ orgId: s.ws.org.id, userId: s.ws.viewer.id, action, entityType, entityId, summary, summaryAr });

async function sectionInScope(s: School, id: string) {
  const sec = await db.section.findFirst({ where: { id, orgId: s.ws.org.id, yearId: s.year.id, campusId: { in: s.campusIds } }, include: { grade: true } });
  if (!sec) throw new DocError("empty.notFound");
  return sec;
}

// ───────────────────────── Classes ─────────────────────────

const sectionInput = z.object({
  campusId: z.string().min(1),
  gradeId: z.string().min(1),
  name: z.string().trim().min(1).max(12),
  room: z.string().trim().max(20).default(""),
  capacity: z.number().int().min(1).max(60),
  homeroomId: z.string().default(""),
});
export type SectionInput = z.input<typeof sectionInput>;

export async function saveSection(slug: string, id: string | null, raw: SectionInput): Promise<ActionResult<{ id: string }>> {
  return attempt(async () => {
    const s = await manager(slug);
    const parsed = sectionInput.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "errors.required", field: String(parsed.error.issues[0]?.path[0] ?? "") };
    const d = parsed.data;
    if (!s.campusIds.includes(d.campusId)) return { ok: false, error: "empty.notAllowed", field: "campusId" };
    const grade = await db.grade.findFirst({ where: { id: d.gradeId, orgId: s.ws.org.id } });
    if (!grade) return { ok: false, error: "errors.required", field: "gradeId" };
    const name = d.name.toUpperCase();
    const clash = await db.section.findFirst({ where: { yearId: s.year.id, campusId: d.campusId, gradeId: d.gradeId, name, ...(id ? { NOT: { id } } : {}) } });
    if (clash) return { ok: false, error: "classes.taken", field: "name" };
    if (d.homeroomId && !(await db.employee.findFirst({ where: { id: d.homeroomId, orgId: s.ws.org.id } }))) return { ok: false, error: "errors.required", field: "homeroomId" };
    const data = { campusId: d.campusId, gradeId: d.gradeId, name, room: d.room || null, capacity: d.capacity, homeroomId: d.homeroomId || null };
    let sid = id;
    if (id) {
      await sectionInScope(s, id);
      await db.section.update({ where: { id }, data });
    } else {
      const created = await db.$transaction(async (tx) => {
        const sec = await tx.section.create({ data: { ...data, orgId: s.ws.org.id, yearId: s.year.id } });
        // Same subjects (and teachers) as a sister class, or the usual curriculum for the stage.
        const sister = await tx.section.findFirst({ where: { yearId: s.year.id, campusId: d.campusId, gradeId: d.gradeId, NOT: { id: sec.id } }, include: { assignments: true } });
        if (sister?.assignments.length) {
          await tx.teachingAssignment.createMany({ data: sister.assignments.map((a) => ({ orgId: s.ws.org.id, sectionId: sec.id, subjectId: a.subjectId, teacherId: null, periods: a.periods })) });
        } else {
          const subjects = await tx.subject.findMany({ where: { orgId: s.ws.org.id } });
          const plan = CURRICULUM[stageOf(grade.level)];
          await tx.teachingAssignment.createMany({ data: subjects.filter((x) => plan[x.code]).map((x) => ({ orgId: s.ws.org.id, sectionId: sec.id, subjectId: x.id, periods: plan[x.code] })) });
        }
        return sec;
      });
      sid = created.id;
    }
    await log(s, id ? "class.updated" : "class.created", "section", sid!, `${id ? "updated" : "created"} class ${sectionLabel(grade, name)}`, `${id ? "تعديل" : "إنشاء"} الشعبة ${sectionLabelAr(grade, name)}`);
    refresh();
    return { ok: true, id: sid! };
  });
}

const assignmentInput = z.object({ subjectId: z.string().min(1), teacherId: z.string().default(""), periods: z.number().int().min(0).max(20) });

export async function saveAssignment(slug: string, sectionId: string, raw: z.input<typeof assignmentInput>): Promise<ActionResult> {
  return attempt(async () => {
    const s = await manager(slug);
    const sec = await sectionInScope(s, sectionId);
    const d = assignmentInput.parse(raw);
    if (!(await db.subject.findFirst({ where: { id: d.subjectId, orgId: s.ws.org.id } }))) return { ok: false, error: "errors.required" };
    if (d.teacherId && !(await db.employee.findFirst({ where: { id: d.teacherId, orgId: s.ws.org.id } }))) return { ok: false, error: "errors.required" };
    await db.$transaction(async (tx) => {
      await tx.teachingAssignment.upsert({
        where: { sectionId_subjectId: { sectionId, subjectId: d.subjectId } },
        create: { orgId: s.ws.org.id, sectionId, subjectId: d.subjectId, teacherId: d.teacherId || null, periods: d.periods },
        update: { teacherId: d.teacherId || null, periods: d.periods },
      });
      // Lessons already on the timetable follow the new teacher.
      await tx.timetableSlot.updateMany({ where: { sectionId, subjectId: d.subjectId }, data: { teacherId: d.teacherId || null } });
    });
    await log(s, "class.assignment", "section", sectionId, `updated teaching for ${sectionLabel(sec.grade, sec.name)}`, `تعديل إسناد المواد للشعبة ${sectionLabelAr(sec.grade, sec.name)}`);
    refresh();
    return { ok: true };
  });
}

export async function removeAssignment(slug: string, sectionId: string, subjectId: string): Promise<ActionResult> {
  return attempt(async () => {
    const s = await manager(slug);
    await sectionInScope(s, sectionId);
    await db.$transaction([db.timetableSlot.deleteMany({ where: { sectionId, subjectId } }), db.teachingAssignment.deleteMany({ where: { sectionId, subjectId } })]);
    refresh();
    return { ok: true };
  });
}

// ───────────────────────── Timetable ─────────────────────────

/** Put a subject in a period (or clear it). Refuses when the teacher is busy elsewhere. */
export async function placeSlot(slug: string, sectionId: string, day: number, period: number, subjectId: string | null): Promise<ActionResult<{ clash?: { teacher: string; section: string } }>> {
  return attempt(async () => {
    const s = await manager(slug);
    await sectionInScope(s, sectionId);
    if (!s.settings.days.includes(day) || period < 1 || period > s.settings.periods.length) return { ok: false, error: "errors.required" };
    if (!subjectId) {
      await db.timetableSlot.deleteMany({ where: { sectionId, day, period } });
      refresh();
      return { ok: true };
    }
    const a = await db.teachingAssignment.findUnique({ where: { sectionId_subjectId: { sectionId, subjectId } }, include: { teacher: true } });
    if (!a) return { ok: false, error: "errors.required" };
    if (a.teacherId) {
      const busy = await db.timetableSlot.findFirst({ where: { teacherId: a.teacherId, day, period, NOT: { sectionId }, section: { yearId: s.year.id } }, include: { section: { include: { grade: true } } } });
      if (busy) return { ok: false, error: "timetable.clashTeacher", clash: { teacher: a.teacher?.name ?? "", section: sectionLabel(busy.section.grade, busy.section.name) } } as never;
    }
    await db.timetableSlot.upsert({
      where: { sectionId_day_period: { sectionId, day, period } },
      create: { orgId: s.ws.org.id, sectionId, day, period, subjectId, teacherId: a.teacherId },
      update: { subjectId, teacherId: a.teacherId },
    });
    refresh();
    return { ok: true };
  });
}

/** Fill the remaining periods without teacher clashes. */
export async function autoFillTimetable(slug: string, sectionId: string): Promise<ActionResult<{ placed: number; left: number }>> {
  return attempt(async () => {
    const s = await manager(slug);
    const sec = await sectionInScope(s, sectionId);
    const [assignments, all, subjects] = await Promise.all([
      db.teachingAssignment.findMany({ where: { sectionId } }),
      db.timetableSlot.findMany({ where: { orgId: s.ws.org.id, section: { yearId: s.year.id } } }),
      db.subject.findMany({ where: { orgId: s.ws.org.id } }),
    ]);
    const morning = new Set(subjects.filter((x) => CORE_SUBJECTS.has(x.code)).map((x) => x.id));
    const res = autoFill(sectionId, assignments.map((a) => ({ subjectId: a.subjectId, teacherId: a.teacherId, periods: a.periods })), all, s.settings.days, s.settings.periods.length, morning);
    if (res.placed.length) await db.timetableSlot.createMany({ data: res.placed.map((p) => ({ orgId: s.ws.org.id, sectionId, day: p.day, period: p.period, subjectId: p.subjectId, teacherId: p.teacherId })) });
    await log(s, "class.timetable_filled", "section", sectionId, `filled ${res.placed.length} periods for ${sectionLabel(sec.grade, sec.name)}`, `جدولة ${res.placed.length} حصة للشعبة ${sectionLabelAr(sec.grade, sec.name)}`);
    refresh();
    return { ok: true, placed: res.placed.length, left: res.unplaced };
  });
}

export async function clearTimetable(slug: string, sectionId: string): Promise<ActionResult> {
  return attempt(async () => {
    const s = await manager(slug);
    const sec = await sectionInScope(s, sectionId);
    await db.timetableSlot.deleteMany({ where: { sectionId } });
    await log(s, "class.timetable_cleared", "section", sectionId, `cleared the timetable of ${sectionLabel(sec.grade, sec.name)}`, `مسح جدول الشعبة ${sectionLabelAr(sec.grade, sec.name)}`);
    refresh();
    return { ok: true };
  });
}

/** Where a teacher is in each period, to warn before placing (client hint only). */
export async function teacherBusy(slug: string, teacherId: string) {
  const s = await getSchool(slug);
  if (!s.ws.can("school.manage")) return [];
  const rows = await db.timetableSlot.findMany({ where: { teacherId, section: { yearId: s.year.id } }, include: { section: { include: { grade: true } } } });
  return rows.map((r) => ({ day: r.day, period: r.period, sectionId: r.sectionId, label: sectionLabel(r.section.grade, r.section.name) }));
}

// ───────────────────────── Roll call ─────────────────────────

const rollInput = z.object({
  date: ymd,
  entries: z.array(z.object({ studentId: z.string(), status: z.enum(["absent", "late", "excused"]), minutes: z.number().int().min(0).max(240).nullable().default(null), note: z.string().trim().max(200).default("") })).max(80),
});

/** Save a class's roll for a day: only the exceptions are stored. Parents of newly absent children hear about it. */
export async function takeRoll(slug: string, sectionId: string, raw: z.input<typeof rollInput>): Promise<ActionResult<{ absent: number; late: number }>> {
  return attempt(async () => {
    const s = await getSchool(slug);
    if (!canTeach(s, sectionId)) return { ok: false, error: "school.notAllowed" };
    const d = rollInput.parse(raw);
    const sec = await db.section.findFirst({ where: { id: sectionId, orgId: s.ws.org.id }, include: { grade: true, students: { where: { status: "active" }, select: { id: true, name: true, nameAr: true } } } });
    if (!sec) return { ok: false, error: "empty.notFound" };
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(new Date());
    if (d.date > today) return { ok: false, error: "errors.required" };
    const ids = new Set(sec.students.map((x) => x.id));
    const entries = d.entries.filter((e) => ids.has(e.studentId));
    const date = dohaNoon(d.date);
    const before = await db.studentAttendance.findMany({ where: { sectionId, date } });
    const wasAbsent = new Set(before.filter((b) => b.status === "absent").map((b) => b.studentId));
    await db.$transaction(async (tx) => {
      await tx.studentAttendance.deleteMany({ where: { sectionId, date } });
      if (entries.length) {
        await tx.studentAttendance.createMany({
          data: entries.map((e) => ({ orgId: s.ws.org.id, studentId: e.studentId, sectionId, date, status: e.status, minutes: e.status === "late" ? e.minutes : null, note: e.note || null, notifiedAt: before.find((b) => b.studentId === e.studentId)?.notifiedAt ?? null })),
        });
      }
      const counts = { absent: entries.filter((e) => e.status === "absent").length, late: entries.filter((e) => e.status === "late").length, excused: entries.filter((e) => e.status === "excused").length };
      await tx.attendanceRoll.upsert({
        where: { sectionId_date: { sectionId, date } },
        create: { orgId: s.ws.org.id, sectionId, date, takenById: s.ws.viewer.id, size: sec.students.length, ...counts },
        update: { takenById: s.ws.viewer.id, takenAt: new Date(), size: sec.students.length, ...counts },
      });
    });
    // Tell parents (with the parent view) about new absences today.
    const fresh = entries.filter((e) => e.status === "absent" && !wasAbsent.has(e.studentId));
    if (fresh.length && d.date === today) {
      const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Qatar", hour: "2-digit", minute: "2-digit" }).format(new Date());
      const links = await db.studentGuardian.findMany({ where: { studentId: { in: fresh.map((f) => f.studentId) }, guardian: { userId: { not: null } } }, include: { guardian: true, student: true } });
      for (const l of links) {
        await notify(db, {
          orgId: s.ws.org.id,
          userIds: [l.guardian.userId!],
          kind: "school.absent",
          title: `${l.student.name.split(" ")[0]} is absent today`,
          titleAr: `${(l.student.nameAr ?? l.student.name).split(" ")[0]} غائب اليوم`,
          body: `Marked absent at ${time} in ${sectionLabel(sec.grade, sec.name)}. Please let the school know the reason.`,
          bodyAr: `سُجّل الغياب الساعة ${time} في ${sectionLabelAr(sec.grade, sec.name)}. يرجى إبلاغ المدرسة بالسبب.`,
          href: "children",
        });
      }
      await db.studentAttendance.updateMany({ where: { sectionId, date, studentId: { in: fresh.map((f) => f.studentId) } }, data: { notifiedAt: new Date() } });
    }
    await log(s, "roll.taken", "section", sectionId, `took the roll for ${sectionLabel(sec.grade, sec.name)} on ${d.date}`, `تسجيل حضور الشعبة ${sectionLabelAr(sec.grade, sec.name)} ليوم ${d.date}`);
    refresh();
    return { ok: true, absent: entries.filter((e) => e.status === "absent").length, late: entries.filter((e) => e.status === "late").length };
  });
}
