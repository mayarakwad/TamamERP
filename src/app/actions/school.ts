"use server";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getWorkspace } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { DocError } from "@/lib/docs/ops";
import { nextNumber } from "@/lib/series";
import { campusCookie, getSchool, type School } from "@/lib/school/scope";
import { schoolSettings, type SchoolSettings } from "@/lib/school/settings";
import { indexGuardian, indexStudent, reindexOrg } from "@/lib/search/index-core";
import { rollover } from "@/lib/school/rollover";
import type { Permission } from "@/lib/rbac";
import type { Prisma } from "@/generated/prisma/client";
import type { ActionResult } from "./claims";

const dohaNoon = (ymd: string) => new Date(`${ymd}T12:00:00+03:00`);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The school context for an action, or a friendly "not allowed". */
async function sch(slug: string, ...perms: Permission[]) {
  const s = await getSchool(slug);
  if (perms.length && !perms.some((p) => s.ws.can(p))) throw new DocError("empty.notAllowed");
  return s;
}

async function attempt<R extends ActionResult<object>>(fn: () => Promise<R>): Promise<R | { ok: false; error: string }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DocError) return { ok: false, error: e.code };
    throw e;
  }
}

const log = (s: School, action: string, entityType: string, entityId: string, summary: string, summaryAr: string, sensitive = false) =>
  audit({ orgId: s.ws.org.id, userId: s.ws.viewer.id, action, entityType, entityId, summary, summaryAr, sensitive });

// ───────────────────────── Campus switcher ─────────────────────────

export async function setCampus(slug: string, campusId: string | null): Promise<ActionResult> {
  const ws = await getWorkspace(slug);
  if (ws.membership.campusId) return { ok: false, error: "empty.notAllowed" };
  const jar = await cookies();
  if (campusId && ws.org.campuses.some((c) => c.id === campusId)) jar.set(campusCookie(ws.org.id), campusId, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
  else jar.delete(campusCookie(ws.org.id));
  refresh();
  return { ok: true };
}

// ───────────────────────── School setup ─────────────────────────

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const settingsInput = z.object({
  periods: z.array(z.object({ start: hhmm, end: hhmm })).min(1).max(12),
  rollBy: hhmm,
  installments: z.array(z.object({ label: z.string().trim().min(1).max(40), labelAr: z.string().trim().max(40), due: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/), pct: z.number().int().min(1).max(100) })).min(1).max(12),
  sibling: z.array(z.number().int().min(0).max(10000)).length(4),
  staffDiscount: z.number().int().min(0).max(10000),
  scale: z.array(z.object({ min: z.number().int().min(0).max(100), letter: z.string().trim().min(1).max(3), label: z.string().trim().max(40), labelAr: z.string().trim().max(40) })).min(2).max(12),
  passMark: z.number().int().min(0).max(100),
  loanDays: z.number().int().min(1).max(90),
  admissionsOpen: z.boolean(),
  feeTerms: z.string().trim().max(600).default(""),
  terms: z.array(z.object({ id: z.string(), start: ymd, end: ymd })).max(6),
});
export type SchoolSettingsInput = z.input<typeof settingsInput>;

export async function saveSchoolSetup(slug: string, raw: SchoolSettingsInput): Promise<ActionResult> {
  return attempt(async () => {
    const s = await sch(slug, "school.manage", "workspace.manage");
    const parsed = settingsInput.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "errors.required", field: String(parsed.error.issues[0]?.path.join(".") ?? "") };
    const d = parsed.data;
    if (d.installments.reduce((x, i) => x + i.pct, 0) !== 100) return { ok: false, error: "schoolSetup.shareTotal", field: "installments" };
    for (const p of d.periods) if (p.end <= p.start) return { ok: false, error: "errors.required", field: "periods" };
    const current = schoolSettings(s.ws.org);
    const school: SchoolSettings = {
      ...current,
      periods: [...d.periods].sort((a, b) => a.start.localeCompare(b.start)),
      breaks: current.breaks.filter((b) => b.after < d.periods.length),
      rollBy: d.rollBy,
      installments: d.installments,
      sibling: d.sibling,
      staffDiscount: d.staffDiscount,
      scale: [...d.scale].sort((a, b) => b.min - a.min),
      passMark: d.passMark,
      loanDays: d.loanDays,
      admissionsOpen: d.admissionsOpen,
      feeTerms: d.feeTerms || undefined,
    };
    const settings = (s.ws.org.settings && typeof s.ws.org.settings === "object" ? s.ws.org.settings : {}) as Record<string, unknown>;
    await db.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: s.ws.org.id }, data: { settings: JSON.parse(JSON.stringify({ ...settings, school })) as Prisma.InputJsonValue } });
      for (const t of d.terms) {
        if (t.end < t.start) throw new DocError("errors.required");
        await tx.term.updateMany({ where: { id: t.id, orgId: s.ws.org.id }, data: { startDate: dohaNoon(t.start), endDate: dohaNoon(t.end) } });
      }
    });
    await log(s, "school.setup_saved", "organization", s.ws.org.id, "updated the school setup", "تحديث إعداد المدرسة");
    refresh();
    return { ok: true };
  });
}

const subjectInput = z.object({ code: z.string().trim().min(1).max(8), name: z.string().trim().min(2).max(60), nameAr: z.string().trim().max(60).default(""), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#4B3FA8") });

export async function saveSubject(slug: string, id: string | null, raw: z.input<typeof subjectInput>): Promise<ActionResult<{ id: string }>> {
  return attempt(async () => {
    const s = await sch(slug, "school.manage");
    const parsed = subjectInput.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "errors.required", field: String(parsed.error.issues[0]?.path[0] ?? "") };
    const d = { ...parsed.data, code: parsed.data.code.toUpperCase(), nameAr: parsed.data.nameAr || null };
    const clash = await db.subject.findFirst({ where: { orgId: s.ws.org.id, code: d.code, ...(id ? { NOT: { id } } : {}) } });
    if (clash) return { ok: false, error: "schoolSetup.codeTaken", field: "code" };
    if (id) {
      const res = await db.subject.updateMany({ where: { id, orgId: s.ws.org.id }, data: d });
      if (!res.count) return { ok: false, error: "empty.notFound" };
      refresh();
      return { ok: true, id };
    }
    const sort = await db.subject.count({ where: { orgId: s.ws.org.id } });
    const row = await db.subject.create({ data: { ...d, orgId: s.ws.org.id, sort } });
    await log(s, "school.subject_added", "subject", row.id, `added the subject ${d.name}`, `إضافة مادة ${d.nameAr ?? d.name}`);
    refresh();
    return { ok: true, id: row.id };
  });
}

// ───────────────────────── Guardians ─────────────────────────

const guardianInput = z.object({
  name: z.string().trim().min(2).max(120),
  nameAr: z.string().trim().max(120).default(""),
  phone: z.string().trim().min(5).max(40),
  email: z.union([z.email(), z.literal("")]).default(""),
  qid: z.string().trim().max(20).default(""),
  employer: z.string().trim().max(120).default(""),
  address: z.string().trim().max(300).default(""),
  addressAr: z.string().trim().max(300).default(""),
});
export type GuardianInput = z.input<typeof guardianInput>;

function guardianData(d: z.output<typeof guardianInput>) {
  return {
    name: d.name,
    nameAr: d.nameAr || null,
    phone: d.phone,
    email: d.email ? d.email.toLowerCase() : null,
    qid: d.qid || null,
    employer: d.employer || null,
    address: d.address || null,
    addressAr: d.addressAr || null,
  };
}

export async function saveGuardian(slug: string, id: string | null, raw: GuardianInput): Promise<ActionResult<{ id: string }>> {
  return attempt(async () => {
    const s = await sch(slug, "school.manage");
    const parsed = guardianInput.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.path[0] === "email" ? "errors.invalidEmail" : "errors.required", field: String(parsed.error.issues[0]?.path[0] ?? "") };
    const data = guardianData(parsed.data);
    let gid = id;
    if (id) {
      const g = await db.guardian.findFirst({ where: { id, orgId: s.ws.org.id } });
      if (!g) return { ok: false, error: "empty.notFound" };
      await db.guardian.update({ where: { id }, data });
      if (g.partyId) await db.party.update({ where: { id: g.partyId }, data: { name: data.name, nameAr: data.nameAr, phone: data.phone, email: data.email, address: data.address, addressAr: data.addressAr } });
      await log(s, "guardian.updated", "guardian", id, `updated ${data.name}`, `تعديل بيانات ${data.nameAr ?? data.name}`);
    } else {
      const g = await db.guardian.create({ data: { ...data, orgId: s.ws.org.id } });
      gid = g.id;
      await log(s, "guardian.created", "guardian", g.id, `added the parent ${data.name}`, `إضافة ولي الأمر ${data.nameAr ?? data.name}`);
    }
    await indexGuardian(db, gid!);
    refresh();
    return { ok: true, id: gid! };
  });
}

const inviteHash = (t: string) => createHash("sha256").update(t).digest("hex");

/** Give a parent the parent view: link an existing account, or create an invitation. */
export async function inviteGuardian(slug: string, id: string): Promise<ActionResult<{ url?: string; linked?: boolean }>> {
  return attempt(async () => {
    const s = await sch(slug, "school.manage");
    if (!s.ws.can("members.manage")) return { ok: false, error: "empty.notAllowed" };
    const g = await db.guardian.findFirst({ where: { id, orgId: s.ws.org.id } });
    if (!g) return { ok: false, error: "empty.notFound" };
    if (!g.email) return { ok: false, error: "guardians.needEmail" };
    const user = await db.user.findUnique({ where: { email: g.email } });
    if (user) {
      const m = await db.membership.findFirst({ where: { orgId: s.ws.org.id, userId: user.id } });
      if (!m) await db.membership.create({ data: { orgId: s.ws.org.id, userId: user.id, role: "parent", title: "Parent", titleAr: "ولي أمر" } });
      await db.guardian.update({ where: { id }, data: { userId: user.id } });
      await log(s, "guardian.linked", "guardian", id, `gave ${g.name} the parent view`, `منح ${g.nameAr ?? g.name} بوابة ولي الأمر`, true);
      refresh();
      return { ok: true, linked: true };
    }
    const token = randomBytes(24).toString("base64url");
    await db.invitation.create({ data: { orgId: s.ws.org.id, email: g.email, role: "parent", title: "Parent", tokenHash: inviteHash(token), invitedById: s.ws.viewer.id, expiresAt: new Date(Date.now() + 14 * 86400_000) } });
    await log(s, "guardian.invited", "guardian", id, `invited ${g.email} to the parent view`, `دعوة ${g.email} إلى بوابة ولي الأمر`, true);
    refresh();
    return { ok: true, url: `/invite/${token}` };
  });
}

// ───────────────────────── Students ─────────────────────────

const studentInput = z.object({
  name: z.string().trim().min(2).max(120),
  nameAr: z.string().trim().max(120).default(""),
  gender: z.enum(["m", "f"]),
  dob: ymd,
  nationality: z.string().trim().max(2).default(""),
  qid: z.string().trim().max(20).default(""),
  qidExpiry: z.union([ymd, z.literal("")]).default(""),
  passportNumber: z.string().trim().max(20).default(""),
  sectionId: z.string().min(1),
  joinedOn: ymd,
  bloodGroup: z.string().trim().max(4).default(""),
  medical: z.string().trim().max(600).default(""),
  busStopId: z.string().default(""),
  discountKind: z.enum(["", "staff", "scholarship"]).default(""),
  discountPct: z.number().int().min(0).max(10000).default(0),
  previousSchool: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(1000).default(""),
  guardians: z
    .array(
      z.object({
        id: z.string().optional(),
        relation: z.enum(["father", "mother", "guardian", "grandparent", "other"]),
        primary: z.boolean(),
        details: guardianInput.optional(),
      }),
    )
    .max(4),
});
export type StudentInput = z.input<typeof studentInput>;

const COLORS = ["#4B3FA8", "#0B6E8A", "#B5541C", "#1F7A4D", "#8A1538", "#2F7DB8", "#A86B00", "#C4467A", "#5A6B7A", "#8E5CC9", "#D9644A", "#0B8A7A"];

export async function saveStudent(slug: string, id: string | null, raw: StudentInput): Promise<ActionResult<{ id: string }>> {
  return attempt(async () => {
    const s = await sch(slug, "school.manage");
    const parsed = studentInput.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "errors.required", field: String(parsed.error.issues[0]?.path[0] ?? "") };
    const d = parsed.data;
    if (!id && !d.guardians.length) return { ok: false, error: "students.needGuardian", field: "guardians" };
    const section = await db.section.findFirst({ where: { id: d.sectionId, orgId: s.ws.org.id, campusId: { in: s.campusIds } }, include: { _count: { select: { students: { where: { status: "active" } } } } } });
    if (!section) return { ok: false, error: "students.needSection", field: "sectionId" };
    const existing = id ? await db.student.findFirst({ where: { id, orgId: s.ws.org.id } }) : null;
    if (id && !existing) return { ok: false, error: "empty.notFound" };
    if (section._count.students >= section.capacity && existing?.sectionId !== section.id) return { ok: false, error: "students.sectionFull", field: "sectionId" };
    if (d.busStopId && !(await db.busStop.findFirst({ where: { id: d.busStopId, orgId: s.ws.org.id } }))) return { ok: false, error: "errors.required", field: "busStopId" };

    const data = {
      name: d.name,
      nameAr: d.nameAr || null,
      gender: d.gender,
      dob: dohaNoon(d.dob),
      nationality: d.nationality ? d.nationality.toUpperCase() : null,
      qid: d.qid || null,
      qidExpiry: d.qidExpiry ? dohaNoon(d.qidExpiry) : null,
      passportNumber: d.passportNumber || null,
      campusId: section.campusId,
      gradeId: section.gradeId,
      sectionId: section.id,
      joinedOn: dohaNoon(d.joinedOn),
      bloodGroup: d.bloodGroup || null,
      medical: d.medical || null,
      busStopId: d.busStopId || null,
      discountKind: d.discountKind || null,
      discountPct: d.discountKind === "scholarship" ? d.discountPct : 0,
      previousSchool: d.previousSchool || null,
      notes: d.notes || null,
    };
    const studentId = await db.$transaction(async (tx) => {
      let sid = id;
      if (existing) {
        await tx.student.update({ where: { id: existing.id }, data });
      } else {
        const number = await nextNumber(tx, s.ws.org.id, "ADM", data.joinedOn);
        const st = await tx.student.create({ data: { ...data, orgId: s.ws.org.id, number, avatarColor: COLORS[Math.floor(Math.random() * COLORS.length)] } });
        sid = st.id;
      }
      // Guardians: link existing families, create new parents.
      if (d.guardians.length) {
        const keep: string[] = [];
        const hasPrimary = d.guardians.some((g) => g.primary);
        for (const [i, g] of d.guardians.entries()) {
          let gid = g.id;
          if (gid) {
            if (!(await tx.guardian.findFirst({ where: { id: gid, orgId: s.ws.org.id } }))) throw new DocError("empty.notFound");
          } else if (g.details) {
            const gp = guardianInput.safeParse(g.details);
            if (!gp.success) throw new DocError("students.needGuardian");
            gid = (await tx.guardian.create({ data: { ...guardianData(gp.data), orgId: s.ws.org.id } })).id;
          } else continue;
          keep.push(gid);
          const primary = g.primary || (!hasPrimary && i === 0);
          await tx.studentGuardian.upsert({
            where: { studentId_guardianId: { studentId: sid!, guardianId: gid } },
            create: { orgId: s.ws.org.id, studentId: sid!, guardianId: gid, relation: g.relation, primary },
            update: { relation: g.relation, primary },
          });
        }
        await tx.studentGuardian.deleteMany({ where: { studentId: sid!, guardianId: { notIn: keep } } });
      }
      return sid!;
    });
    for (const g of await db.studentGuardian.findMany({ where: { studentId }, select: { guardianId: true } })) await indexGuardian(db, g.guardianId);
    await indexStudent(db, studentId);
    await log(s, existing ? "student.updated" : "student.enrolled", "student", studentId, existing ? `updated ${d.name}` : `enrolled ${d.name}`, existing ? `تعديل بيانات ${d.nameAr || d.name}` : `قيد الطالب ${d.nameAr || d.name}`);
    refresh();
    return { ok: true, id: studentId };
  });
}

export async function moveStudent(slug: string, id: string, sectionId: string): Promise<ActionResult> {
  return attempt(async () => {
    const s = await sch(slug, "school.manage");
    const st = await db.student.findFirst({ where: { id, orgId: s.ws.org.id, campusId: { in: s.campusIds } } });
    const section = await db.section.findFirst({ where: { id: sectionId, orgId: s.ws.org.id, yearId: s.year.id }, include: { grade: true, _count: { select: { students: { where: { status: "active" } } } } } });
    if (!st || !section) return { ok: false, error: "empty.notFound" };
    if (section._count.students >= section.capacity) return { ok: false, error: "students.sectionFull" };
    await db.student.update({ where: { id }, data: { sectionId, gradeId: section.gradeId, campusId: section.campusId } });
    await log(s, "student.moved", "student", id, `moved ${st.name} to ${section.grade.name} ${section.name}`, `نقل ${st.nameAr ?? st.name} إلى شعبة أخرى`);
    refresh();
    return { ok: true };
  });
}

export async function setStudentStatus(slug: string, id: string, status: "active" | "withdrawn", date?: string): Promise<ActionResult> {
  return attempt(async () => {
    const s = await sch(slug, "school.manage");
    const st = await db.student.findFirst({ where: { id, orgId: s.ws.org.id, campusId: { in: s.campusIds } } });
    if (!st) return { ok: false, error: "empty.notFound" };
    await db.student.update({ where: { id }, data: status === "withdrawn" ? { status, leftOn: date ? dohaNoon(date) : new Date() } : { status, leftOn: null } });
    await indexStudent(db, id);
    await log(s, status === "withdrawn" ? "student.withdrawn" : "student.reinstated", "student", id, `${status === "withdrawn" ? "withdrew" : "re-enrolled"} ${st.name}`, `${status === "withdrawn" ? "انسحاب" : "إعادة قيد"} ${st.nameAr ?? st.name}`, true);
    refresh();
    return { ok: true };
  });
}

/** Families to pick from when adding a student (search by name or phone). */
export async function findGuardians(slug: string, q: string) {
  const s = await sch(slug, "school.manage");
  const term = q.trim();
  if (term.length < 2) return [];
  const rows = await db.guardian.findMany({
    where: { orgId: s.ws.org.id, OR: [{ name: { contains: term } }, { nameAr: { contains: term } }, { phone: { contains: term.replace(/\s+/g, " ") } }, { email: { contains: term.toLowerCase() } }] },
    include: { children: { include: { student: { select: { name: true, nameAr: true } } } } },
    take: 12,
  });
  return rows.map((g) => ({ id: g.id, name: g.name, nameAr: g.nameAr, phone: g.phone, children: g.children.map((c) => c.student.name) }));
}

// ───────────────────────── New school year ─────────────────────────

export async function startNewYear(slug: string, raw: { copyTimetables: boolean; feeIncreasePct: number; confirm: string }): Promise<ActionResult<{ year: string; promoted: number; graduated: number }>> {
  return attempt(async () => {
    const s = await sch(slug, "workspace.manage");
    if (s.locked) return { ok: false, error: "empty.notAllowed" };
    const next = await db.academicYear.findFirst({ where: { orgId: s.ws.org.id, startDate: { gt: s.year.startDate } }, orderBy: { startDate: "asc" } });
    const expected = next?.name ?? "";
    if (!next || raw.confirm.trim() !== expected) return { ok: false, error: "errors.required", field: "confirm" };
    const pct = Math.max(0, Math.min(30, Number(raw.feeIncreasePct) || 0));
    const res = await db.$transaction((tx) => rollover(tx, s.ws.org.id, s.ws.viewer.id, { copyTimetables: !!raw.copyTimetables, feeIncreasePct: pct }), { timeout: 300_000 });
    await reindexOrg(db, s.ws.org.id);
    await log(s, "school.new_year", "academicYear", next.id, `started ${res.year}: ${res.promoted} promoted, ${res.graduated} graduated, ${res.transferred} changed campus`, `بدء العام ${res.year}: انتقل ${res.promoted} وتخرّج ${res.graduated}`, true);
    refresh();
    return { ok: true, year: res.year, promoted: res.promoted, graduated: res.graduated };
  });
}
