"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DocError } from "@/lib/docs/ops";
import { notify } from "@/lib/notify";
import { getSchool, type School } from "@/lib/school/scope";
import { parseMark } from "@/lib/school/grading";
import { buildSnapshot } from "@/lib/school/report-card";
import { sectionLabel, sectionLabelAr } from "@/lib/school/settings";
import type { Prisma } from "@/generated/prisma/client";
import type { ActionResult } from "./claims";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dohaAt = (d: string) => new Date(`${d}T09:00:00+03:00`);

async function attempt<R extends ActionResult<object>>(fn: () => Promise<R>): Promise<R | { ok: false; error: string }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DocError) return { ok: false, error: e.code };
    throw e;
  }
}

/** The subject teacher (or the office) may change marks for this class and subject. */
async function mayMark(s: School, sectionId: string, subjectId: string) {
  if (s.ws.can("school.manage")) return true;
  if (!s.employee) return false;
  return (await db.teachingAssignment.count({ where: { sectionId, subjectId, teacherId: s.employee.id } })) > 0;
}

const assessmentInput = z.object({
  sectionId: z.string().min(1),
  subjectId: z.string().min(1),
  termId: z.string().min(1),
  name: z.string().trim().min(2).max(60),
  nameAr: z.string().trim().max(60).default(""),
  kind: z.enum(["exam", "quiz", "assignment", "project"]),
  date: ymd,
  maxScore: z.number().int().min(1).max(1000),
  weight: z.number().int().min(0).max(100),
});
export type AssessmentInput = z.input<typeof assessmentInput>;

export async function saveAssessment(slug: string, id: string | null, raw: AssessmentInput): Promise<ActionResult<{ id: string }>> {
  return attempt(async () => {
    const s = await getSchool(slug);
    const parsed = assessmentInput.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "errors.required", field: String(parsed.error.issues[0]?.path[0] ?? "") };
    const d = parsed.data;
    if (!(await mayMark(s, d.sectionId, d.subjectId))) return { ok: false, error: "school.notAllowed" };
    if (!(await db.term.findFirst({ where: { id: d.termId, orgId: s.ws.org.id } }))) return { ok: false, error: "errors.required" };
    const data = { name: d.name, nameAr: d.nameAr || null, kind: d.kind, date: dohaAt(d.date), maxScore: d.maxScore, weight: d.weight };
    if (id) {
      const a = await db.assessment.findFirst({ where: { id, orgId: s.ws.org.id, sectionId: d.sectionId, subjectId: d.subjectId } });
      if (!a) return { ok: false, error: "empty.notFound" };
      // Shrinking "out of" can't leave marks above the new maximum.
      if (d.maxScore < a.maxScore && (await db.mark.count({ where: { assessmentId: id, score: { gt: d.maxScore * 100 } } }))) return { ok: false, error: "gradebook.invalid", field: "maxScore" };
      await db.assessment.update({ where: { id }, data });
      refresh();
      return { ok: true, id };
    }
    const a = await db.assessment.create({ data: { ...data, orgId: s.ws.org.id, sectionId: d.sectionId, subjectId: d.subjectId, termId: d.termId, createdById: s.ws.viewer.id } });
    refresh();
    return { ok: true, id: a.id };
  });
}

export async function deleteAssessment(slug: string, id: string): Promise<ActionResult> {
  return attempt(async () => {
    const s = await getSchool(slug);
    const a = await db.assessment.findFirst({ where: { id, orgId: s.ws.org.id } });
    if (!a) return { ok: false, error: "empty.notFound" };
    if (!(await mayMark(s, a.sectionId, a.subjectId))) return { ok: false, error: "school.notAllowed" };
    await db.assessment.delete({ where: { id } });
    await audit({ orgId: s.ws.org.id, userId: s.ws.viewer.id, action: "assessment.deleted", entityType: "section", entityId: a.sectionId, summary: `deleted the assessment ${a.name} and its marks`, summaryAr: `حذف التقييم ${a.nameAr ?? a.name} ودرجاته` });
    refresh();
    return { ok: true };
  });
}

const marksInput = z.array(z.object({ assessmentId: z.string(), studentId: z.string(), value: z.string().max(12) })).max(2000);

/** Save typed or pasted marks. Returns cells that didn't parse so the grid can flag them. */
export async function saveMarks(slug: string, sectionId: string, subjectId: string, raw: z.input<typeof marksInput>): Promise<ActionResult<{ saved: number; invalid: { assessmentId: string; studentId: string }[] }>> {
  return attempt(async () => {
    const s = await getSchool(slug);
    if (!(await mayMark(s, sectionId, subjectId))) return { ok: false, error: "school.notAllowed" };
    const cells = marksInput.parse(raw);
    const [assessments, students] = await Promise.all([
      db.assessment.findMany({ where: { orgId: s.ws.org.id, sectionId, subjectId, id: { in: [...new Set(cells.map((c) => c.assessmentId))] } } }),
      db.student.findMany({ where: { sectionId, status: "active" }, select: { id: true } }),
    ]);
    const byId = new Map(assessments.map((a) => [a.id, a]));
    const inClass = new Set(students.map((x) => x.id));
    const invalid: { assessmentId: string; studentId: string }[] = [];
    let saved = 0;
    await db.$transaction(async (tx) => {
      for (const c of cells) {
        const a = byId.get(c.assessmentId);
        if (!a || !inClass.has(c.studentId)) continue;
        const parsed = parseMark(c.value, a.maxScore);
        if (parsed === "invalid") {
          invalid.push({ assessmentId: c.assessmentId, studentId: c.studentId });
          continue;
        }
        if (parsed.score == null && !parsed.absent) await tx.mark.deleteMany({ where: { assessmentId: a.id, studentId: c.studentId } });
        else await tx.mark.upsert({ where: { assessmentId_studentId: { assessmentId: a.id, studentId: c.studentId } }, create: { orgId: s.ws.org.id, assessmentId: a.id, studentId: c.studentId, score: parsed.score, absent: parsed.absent }, update: { score: parsed.score, absent: parsed.absent } });
        saved++;
      }
    });
    return { ok: true, saved, invalid };
  });
}

const seriesInput = z.object({
  termId: z.string().min(1),
  name: z.string().trim().min(2).max(60),
  nameAr: z.string().trim().max(60).default(""),
  date: ymd,
  maxScore: z.number().int().min(1).max(1000),
  weight: z.number().int().min(0).max(100),
  gradeIds: z.array(z.string()).min(1),
});

/** An exam for every subject of the chosen grades (in this person's campuses). */
export async function scheduleExam(slug: string, raw: z.input<typeof seriesInput>): Promise<ActionResult<{ count: number }>> {
  return attempt(async () => {
    const s = await getSchool(slug);
    if (!s.ws.can("school.manage")) return { ok: false, error: "empty.notAllowed" };
    const parsed = seriesInput.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "errors.required", field: String(parsed.error.issues[0]?.path[0] ?? "") };
    const d = parsed.data;
    const assignments = await db.teachingAssignment.findMany({ where: { section: { yearId: s.year.id, campusId: { in: s.campusIds }, gradeId: { in: d.gradeIds } } } });
    const rows: Prisma.AssessmentCreateManyInput[] = assignments.map((a) => ({ orgId: s.ws.org.id, termId: d.termId, sectionId: a.sectionId, subjectId: a.subjectId, name: d.name, nameAr: d.nameAr || null, kind: "exam", date: dohaAt(d.date), maxScore: d.maxScore, weight: d.weight, createdById: s.ws.viewer.id }));
    if (rows.length) await db.assessment.createMany({ data: rows });
    await audit({ orgId: s.ws.org.id, userId: s.ws.viewer.id, action: "exam.scheduled", summary: `scheduled ${d.name} for ${rows.length} class subjects`, summaryAr: `جدولة ${d.nameAr || d.name} لـ${rows.length} مادة` });
    refresh();
    return { ok: true, count: rows.length };
  });
}

// ───────────────────────── Report cards ─────────────────────────

const commentInput = z.object({ studentId: z.string(), termId: z.string(), teacherComment: z.string().max(1200).optional(), principalComment: z.string().max(600).optional() });

export async function saveReportComment(slug: string, raw: z.input<typeof commentInput>): Promise<ActionResult> {
  return attempt(async () => {
    const s = await getSchool(slug);
    const d = commentInput.parse(raw);
    const st = await db.student.findFirst({ where: { id: d.studentId, orgId: s.ws.org.id, status: "active" } });
    if (!st?.sectionId) return { ok: false, error: "empty.notFound" };
    const manage = s.ws.can("school.manage");
    if (d.teacherComment !== undefined && !manage && !s.homeroomIds.includes(st.sectionId)) return { ok: false, error: "school.notAllowed" };
    if (d.principalComment !== undefined && !manage) return { ok: false, error: "empty.notAllowed" };
    const existing = await db.reportCard.findUnique({ where: { studentId_termId: { studentId: st.id, termId: d.termId } } });
    if (existing?.status === "published") return { ok: false, error: "empty.notAllowed" };
    const data = { ...(d.teacherComment !== undefined ? { teacherComment: d.teacherComment.trim() || null } : {}), ...(d.principalComment !== undefined ? { principalComment: d.principalComment.trim() || null } : {}) };
    await db.reportCard.upsert({ where: { studentId_termId: { studentId: st.id, termId: d.termId } }, create: { orgId: s.ws.org.id, studentId: st.id, termId: d.termId, sectionId: st.sectionId, ...data }, update: data });
    refresh();
    return { ok: true };
  });
}

/** Freeze and publish a class's report cards; parents with the parent view are told. */
export async function publishReportCards(slug: string, sectionId: string, termId: string): Promise<ActionResult<{ count: number }>> {
  return attempt(async () => {
    const s = await getSchool(slug);
    if (!s.ws.can("school.manage")) return { ok: false, error: "empty.notAllowed" };
    const sec = await db.section.findFirst({ where: { id: sectionId, orgId: s.ws.org.id, campusId: { in: s.campusIds } }, include: { grade: true, students: { where: { status: "active" } } } });
    const term = await db.term.findFirst({ where: { id: termId, orgId: s.ws.org.id } });
    if (!sec || !term) return { ok: false, error: "empty.notFound" };
    let count = 0;
    for (const st of sec.students) {
      const rc = await db.reportCard.findUnique({ where: { studentId_termId: { studentId: st.id, termId } } });
      if (rc?.status === "published") continue;
      const snapshot = await buildSnapshot(db, st.id, termId, sectionId, s.settings, { teacher: rc?.teacherComment ?? null, principal: rc?.principalComment ?? null, subjects: (rc?.subjectComments as Record<string, string> | null) ?? {} });
      snapshot.student.number = st.number;
      const data = { status: "published", snapshot: snapshot as unknown as Prisma.InputJsonValue, publishedAt: new Date(), publishedById: s.ws.viewer.id, sectionId };
      await db.reportCard.upsert({ where: { studentId_termId: { studentId: st.id, termId } }, create: { orgId: s.ws.org.id, studentId: st.id, termId, ...data }, update: data });
      count++;
      const parents = await db.studentGuardian.findMany({ where: { studentId: st.id, guardian: { userId: { not: null } } }, include: { guardian: true } });
      await notify(db, {
        orgId: s.ws.org.id,
        userIds: parents.map((p) => p.guardian.userId!),
        kind: "school.report",
        title: `${st.name.split(" ")[0]}'s report card is ready`,
        titleAr: `شهادة ${(st.nameAr ?? st.name).split(" ")[0]} جاهزة`,
        body: `${term.name} report card for ${sectionLabel(sec.grade, sec.name)}.`,
        bodyAr: `شهادة ${term.nameAr ?? term.name} للشعبة ${sectionLabelAr(sec.grade, sec.name)}.`,
        href: "children",
      });
    }
    await audit({ orgId: s.ws.org.id, userId: s.ws.viewer.id, action: "report.published", entityType: "section", entityId: sectionId, summary: `published ${count} report cards for ${sectionLabel(sec.grade, sec.name)}`, summaryAr: `نشر ${count} شهادة للشعبة ${sectionLabelAr(sec.grade, sec.name)}`, sensitive: true });
    refresh();
    return { ok: true, count };
  });
}

export async function unpublishReportCard(slug: string, id: string): Promise<ActionResult> {
  return attempt(async () => {
    const s = await getSchool(slug);
    if (!s.ws.can("school.manage")) return { ok: false, error: "empty.notAllowed" };
    const rc = await db.reportCard.findFirst({ where: { id, orgId: s.ws.org.id } });
    if (!rc) return { ok: false, error: "empty.notFound" };
    await db.reportCard.update({ where: { id }, data: { status: "draft", snapshot: undefined, publishedAt: null } });
    await audit({ orgId: s.ws.org.id, userId: s.ws.viewer.id, action: "report.unpublished", entityType: "student", entityId: rc.studentId, summary: "unpublished a report card", summaryAr: "إلغاء نشر شهادة", sensitive: true });
    refresh();
    return { ok: true };
  });
}
