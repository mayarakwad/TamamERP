"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { DocError } from "@/lib/docs/ops";
import { nextNumber } from "@/lib/series";
import { notify, membersWithRoles } from "@/lib/notify";
import { getSchool, type School } from "@/lib/school/scope";
import { schoolSettings, sectionLabel } from "@/lib/school/settings";
import { billNewStudent } from "@/lib/school/fee-ops";
import { indexApplication, indexGuardian, indexStudent } from "@/lib/search/index-core";
import type { ActionResult } from "./claims";

const dohaNoon = (ymd: string) => new Date(`${ymd}T12:00:00+03:00`);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const STAGES = ["applied", "assessment", "offered", "enrolled", "declined", "withdrawn"] as const;
type Stage = (typeof STAGES)[number];

async function sch(slug: string) {
  const s = await getSchool(slug);
  if (!s.ws.can("school.manage")) throw new DocError("empty.notAllowed");
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

const log = (s: School, action: string, id: string, summary: string, summaryAr: string) => audit({ orgId: s.ws.org.id, userId: s.ws.viewer.id, action, entityType: "application", entityId: id, summary, summaryAr });

const applicationInput = z.object({
  yearId: z.string().min(1),
  campusId: z.string().min(1),
  gradeId: z.string().min(1),
  childName: z.string().trim().min(2).max(120),
  childNameAr: z.string().trim().max(120).default(""),
  gender: z.enum(["m", "f"]),
  dob: ymd,
  nationality: z.string().trim().max(2).default(""),
  previousSchool: z.string().trim().max(120).default(""),
  guardianName: z.string().trim().min(2).max(120),
  guardianNameAr: z.string().trim().max(120).default(""),
  guardianRelation: z.enum(["father", "mother", "guardian", "grandparent", "other"]).default("father"),
  guardianPhone: z.string().trim().min(7).max(40),
  guardianEmail: z.union([z.email(), z.literal("")]).default(""),
  source: z.enum(["web", "walkin", "referral", "sibling"]).default("walkin"),
  notes: z.string().trim().max(1000).default(""),
});
export type ApplicationInput = z.input<typeof applicationInput>;

/** An existing family with the same phone or email (siblings get linked, and a discount later). */
async function matchFamily(orgId: string, phone: string, email: string) {
  const digits = phone.replace(/\D/g, "").slice(-8);
  const candidates = await db.guardian.findMany({ where: { orgId, OR: [...(email ? [{ email: email.toLowerCase() }] : []), { phone: { contains: digits.slice(0, 4) } }] }, select: { id: true, phone: true, email: true } });
  return candidates.find((g) => (email && g.email === email.toLowerCase()) || (g.phone ?? "").replace(/\D/g, "").endsWith(digits))?.id ?? null;
}

async function checkRefs(orgId: string, d: z.output<typeof applicationInput>) {
  const [year, campus, grade] = await Promise.all([
    db.academicYear.findFirst({ where: { id: d.yearId, orgId } }),
    db.campus.findFirst({ where: { id: d.campusId, orgId } }),
    db.grade.findFirst({ where: { id: d.gradeId, orgId } }),
  ]);
  if (!year || !campus || !grade) throw new DocError("errors.required");
  return { year, campus, grade };
}

function appData(d: z.output<typeof applicationInput>) {
  return {
    yearId: d.yearId,
    campusId: d.campusId,
    gradeId: d.gradeId,
    childName: d.childName,
    childNameAr: d.childNameAr || null,
    gender: d.gender,
    dob: dohaNoon(d.dob),
    nationality: d.nationality ? d.nationality.toUpperCase() : null,
    previousSchool: d.previousSchool || null,
    guardianName: d.guardianName,
    guardianNameAr: d.guardianNameAr || null,
    guardianRelation: d.guardianRelation,
    guardianPhone: d.guardianPhone,
    guardianEmail: d.guardianEmail ? d.guardianEmail.toLowerCase() : null,
    notes: d.notes || null,
  };
}

export async function saveApplication(slug: string, id: string | null, raw: ApplicationInput): Promise<ActionResult<{ id: string }>> {
  return attempt(async () => {
    const s = await sch(slug);
    const parsed = applicationInput.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.path[0] === "guardianEmail" ? "errors.invalidEmail" : "errors.required", field: String(parsed.error.issues[0]?.path[0] ?? "") };
    const d = parsed.data;
    await checkRefs(s.ws.org.id, d);
    if (!s.campusIds.includes(d.campusId)) return { ok: false, error: "empty.notAllowed", field: "campusId" };
    const data = appData(d);
    const guardianId = await matchFamily(s.ws.org.id, d.guardianPhone, d.guardianEmail);
    let appId = id;
    if (id) {
      const a = await db.application.findFirst({ where: { id, orgId: s.ws.org.id } });
      if (!a) return { ok: false, error: "empty.notFound" };
      await db.application.update({ where: { id }, data: { ...data, guardianId: a.guardianId ?? guardianId } });
    } else {
      const number = await nextNumber(db, s.ws.org.id, "APP");
      const a = await db.application.create({ data: { ...data, orgId: s.ws.org.id, number, source: guardianId ? "sibling" : d.source, guardianId, createdById: s.ws.viewer.id } });
      appId = a.id;
      await log(s, "application.created", a.id, `logged an application for ${d.childName}`, `تسجيل طلب التحاق ${d.childNameAr || d.childName}`);
    }
    await indexApplication(db, appId!);
    refresh();
    return { ok: true, id: appId! };
  });
}

/** Move an application to another stage (not enrolment, which has its own step). */
export async function moveApplication(slug: string, id: string, stage: Stage, extra: { assessmentAt?: string; score?: number | null } = {}): Promise<ActionResult> {
  return attempt(async () => {
    const s = await sch(slug);
    if (!STAGES.includes(stage) || stage === "enrolled") return { ok: false, error: "errors.required" };
    const a = await db.application.findFirst({ where: { id, orgId: s.ws.org.id, campusId: { in: s.campusIds } } });
    if (!a) return { ok: false, error: "empty.notFound" };
    if (a.stage === "enrolled") return { ok: false, error: "empty.notAllowed" };
    const score = extra.score != null && Number.isFinite(extra.score) ? Math.max(0, Math.min(100, Math.round(extra.score))) : undefined;
    const at = extra.assessmentAt ? new Date(extra.assessmentAt) : undefined;
    await db.application.update({
      where: { id },
      data: { stage, ...(stage !== a.stage ? { stageAt: new Date() } : {}), ...(at && !Number.isNaN(at.getTime()) ? { assessmentAt: at } : {}), ...(score !== undefined ? { assessmentScore: score } : {}) },
    });
    if (stage !== a.stage) await log(s, `application.${stage}`, id, `moved ${a.childName} to ${stage}`, `نقل طلب ${a.childNameAr ?? a.childName} إلى مرحلة جديدة`);
    else if (score !== undefined) await log(s, "application.scored", id, `recorded an assessment score of ${score}% for ${a.childName}`, `تسجيل درجة التقييم ${score}% لـ ${a.childNameAr ?? a.childName}`);
    await indexApplication(db, id);
    refresh();
    return { ok: true };
  });
}

const enrollInput = z.object({ sectionId: z.string().default(""), joinedOn: ymd, busStopId: z.string().default("") });

/** Enrol: create the student, link or create the family, and bill the registration fee. */
export async function enrollApplication(slug: string, id: string, raw: z.input<typeof enrollInput>): Promise<ActionResult<{ studentId: string }>> {
  return attempt(async () => {
    const s = await sch(slug);
    const parsed = enrollInput.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "errors.required", field: "joinedOn" };
    const d = parsed.data;
    const a = await db.application.findFirst({ where: { id, orgId: s.ws.org.id, campusId: { in: s.campusIds } }, include: { year: true, grade: true } });
    if (!a) return { ok: false, error: "empty.notFound" };
    if (a.stage === "enrolled" && a.studentId) return { ok: false, error: "empty.notAllowed" };
    const thisYear = a.yearId === s.year.id;
    const section = thisYear
      ? await db.section.findFirst({ where: { id: d.sectionId, orgId: s.ws.org.id, yearId: s.year.id, campusId: a.campusId, gradeId: a.gradeId }, include: { grade: true, _count: { select: { students: { where: { status: "active" } } } } } })
      : null;
    if (thisYear && !section) return { ok: false, error: "students.needSection", field: "sectionId" };
    if (section && section._count.students >= section.capacity) return { ok: false, error: "students.sectionFull", field: "sectionId" };
    const joinedOn = dohaNoon(d.joinedOn);
    const result = await db.$transaction(async (tx) => {
      let guardianId = a.guardianId;
      if (!guardianId) {
        const g = await tx.guardian.create({ data: { orgId: s.ws.org.id, name: a.guardianName, nameAr: a.guardianNameAr, phone: a.guardianPhone, email: a.guardianEmail } });
        guardianId = g.id;
      }
      const number = await nextNumber(tx, s.ws.org.id, "ADM", joinedOn);
      const st = await tx.student.create({
        data: {
          orgId: s.ws.org.id,
          number,
          name: a.childName,
          nameAr: a.childNameAr,
          gender: a.gender,
          dob: a.dob,
          nationality: a.nationality,
          campusId: a.campusId,
          gradeId: a.gradeId,
          sectionId: section?.id ?? null,
          status: thisYear ? "active" : "upcoming",
          joinedOn,
          busStopId: d.busStopId || null,
          previousSchool: a.previousSchool,
          avatarColor: ["#4B3FA8", "#0B6E8A", "#B5541C", "#1F7A4D", "#8A1538", "#2F7DB8", "#A86B00", "#C4467A"][a.number.length % 8],
        },
      });
      await tx.studentGuardian.create({ data: { orgId: s.ws.org.id, studentId: st.id, guardianId, relation: a.guardianRelation, primary: true } });
      await tx.application.update({ where: { id }, data: { stage: "enrolled", stageAt: new Date(), studentId: st.id, guardianId } });
      await billNewStudent(tx, s.ws.org.id, st.id, s.ws.viewer.id, joinedOn);
      return { studentId: st.id, guardianId };
    });
    await indexStudent(db, result.studentId);
    await indexGuardian(db, result.guardianId);
    await indexApplication(db, id);
    await log(s, "application.enrolled", id, `enrolled ${a.childName}${section ? ` in ${sectionLabel(section.grade, section.name)}` : ` for ${a.year.name}`}`, `قيد ${a.childNameAr ?? a.childName}`);
    refresh();
    return { ok: true, studentId: result.studentId };
  });
}

// ───────────────────────── Public application form ─────────────────────────

const recent = new Map<string, number[]>();
const LIMIT = 5;
const WINDOW = 60 * 60 * 1000;

const publicInput = applicationInput.omit({ source: true, notes: true }).extend({ website: z.string().max(0).default(""), consent: z.literal(true) });
export type PublicApplicationInput = z.input<typeof publicInput>;

/** Families apply without an account. Rate-limited per connection; a hidden field catches bots. */
export async function submitPublicApplication(slug: string, raw: PublicApplicationInput): Promise<ActionResult<{ number: string }>> {
  return attempt(async () => {
    const org = await db.organization.findUnique({ where: { slug } });
    if (!org || org.type !== "school" || !schoolSettings(org).admissionsOpen) return { ok: false, error: "apply.closed" };
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const now = Date.now();
    const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW);
    if (hits.length >= LIMIT) return { ok: false, error: "apply.tooMany" };
    const parsed = publicInput.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.path[0] === "guardianEmail" ? "errors.invalidEmail" : "errors.required", field: String(parsed.error.issues[0]?.path[0] ?? "") };
    recent.set(ip, [...hits, now]);
    const d = { ...parsed.data, source: "web" as const, notes: "" };
    const { year, campus, grade } = await checkRefs(org.id, d);
    if (year.endDate < new Date()) return { ok: false, error: "errors.required", field: "yearId" };
    const guardianId = await matchFamily(org.id, d.guardianPhone, d.guardianEmail);
    const number = await nextNumber(db, org.id, "APP");
    const a = await db.application.create({ data: { ...appData(d), orgId: org.id, number, source: "web", guardianId } });
    await indexApplication(db, a.id);
    await audit({ orgId: org.id, action: "application.received", entityType: "application", entityId: a.id, summary: `received an online application for ${d.childName}`, summaryAr: `استلام طلب التحاق إلكتروني لـ ${d.childNameAr || d.childName}` });
    await notify(db, {
      orgId: org.id,
      userIds: await membersWithRoles(db, org.id, ["owner", "admin"]),
      kind: "application.received",
      title: `New application: ${d.childName}`,
      titleAr: `طلب التحاق جديد: ${d.childNameAr || d.childName}`,
      body: `${grade.name} · ${campus.name}`,
      bodyAr: `${grade.nameAr ?? grade.name} · ${campus.nameAr ?? campus.name}`,
      href: `admissions?open=${a.id}`,
    });
    return { ok: true, number };
  });
}
