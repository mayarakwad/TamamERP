"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { parseMoney } from "@/lib/money";
import { DocError } from "@/lib/docs/ops";
import { notify } from "@/lib/notify";
import { getSchool, type School } from "@/lib/school/scope";
import { indexBook, indexStudent } from "@/lib/search/index-core";
import type { Permission } from "@/lib/rbac";
import type { ActionResult } from "./claims";

const dohaNoon = (ymd: string) => new Date(`${ymd}T12:00:00+03:00`);
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal("")]);

async function attempt<R extends ActionResult<object>>(fn: () => Promise<R>): Promise<R | { ok: false; error: string }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DocError) return { ok: false, error: e.code };
    throw e;
  }
}

async function sch(slug: string, ...perms: Permission[]) {
  const s = await getSchool(slug);
  if (!perms.some((p) => s.ws.can(p))) throw new DocError("empty.notAllowed");
  return s;
}

const log = (s: School, action: string, entityType: string, entityId: string, summary: string, summaryAr: string) => audit({ orgId: s.ws.org.id, userId: s.ws.viewer.id, action, entityType, entityId, summary, summaryAr });

// ───────────────────────── Transport ─────────────────────────

const routeInput = z.object({
  campusId: z.string().min(1),
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(2).max(80),
  nameAr: z.string().trim().max(80).default(""),
  driverName: z.string().trim().max(80).default(""),
  driverPhone: z.string().trim().max(40).default(""),
  attendantName: z.string().trim().max(80).default(""),
  attendantPhone: z.string().trim().max(40).default(""),
  plate: z.string().trim().max(20).default(""),
  capacity: z.number().int().min(1).max(80),
  annualFee: z.string().max(20).default(""),
  stops: z.array(z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(80), nameAr: z.string().trim().max(80).default(""), pickup: hhmm.default(""), dropoff: hhmm.default("") })).max(30),
});
export type RouteInput = z.input<typeof routeInput>;

export async function saveRoute(slug: string, id: string | null, raw: RouteInput): Promise<ActionResult<{ id: string }>> {
  return attempt(async () => {
    const s = await sch(slug, "transport.manage", "school.manage");
    const parsed = routeInput.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "errors.required", field: String(parsed.error.issues[0]?.path[0] ?? "") };
    const d = parsed.data;
    if (!s.campusIds.includes(d.campusId)) return { ok: false, error: "empty.notAllowed", field: "campusId" };
    const fee = d.annualFee.trim() ? parseMoney(d.annualFee) : 0;
    if (fee == null) return { ok: false, error: "claims.amountInvalid", field: "annualFee" };
    const clash = await db.busRoute.findFirst({ where: { orgId: s.ws.org.id, code: d.code, ...(id ? { NOT: { id } } : {}) } });
    if (clash) return { ok: false, error: "classes.taken", field: "code" };
    const data = { campusId: d.campusId, code: d.code, name: d.name, nameAr: d.nameAr || null, driverName: d.driverName || null, driverPhone: d.driverPhone || null, attendantName: d.attendantName || null, attendantPhone: d.attendantPhone || null, plate: d.plate || null, capacity: d.capacity, annualFee: fee };
    const routeId = await db.$transaction(async (tx) => {
      let rid = id;
      if (id) {
        const r = await tx.busRoute.findFirst({ where: { id, orgId: s.ws.org.id } });
        if (!r) throw new DocError("empty.notFound");
        await tx.busRoute.update({ where: { id }, data });
      } else rid = (await tx.busRoute.create({ data: { ...data, orgId: s.ws.org.id } })).id;
      const keep: string[] = [];
      for (const [i, st] of d.stops.entries()) {
        const fields = { name: st.name, nameAr: st.nameAr || null, sort: i, pickup: st.pickup || null, dropoff: st.dropoff || null };
        if (st.id && (await tx.busStop.findFirst({ where: { id: st.id, routeId: rid! } }))) {
          await tx.busStop.update({ where: { id: st.id }, data: fields });
          keep.push(st.id);
        } else keep.push((await tx.busStop.create({ data: { ...fields, orgId: s.ws.org.id, routeId: rid! } })).id);
      }
      // Students at a removed stop simply lose their stop.
      await tx.busStop.deleteMany({ where: { routeId: rid!, id: { notIn: keep } } });
      return rid!;
    });
    await log(s, id ? "route.updated" : "route.created", "route", routeId, `${id ? "updated" : "added"} ${d.code} · ${d.name}`, `${id ? "تعديل" : "إضافة"} ${d.code} · ${d.nameAr || d.name}`);
    refresh();
    return { ok: true, id: routeId };
  });
}

export async function setRider(slug: string, studentId: string, stopId: string | null): Promise<ActionResult> {
  return attempt(async () => {
    const s = await sch(slug, "transport.manage", "school.manage");
    const st = await db.student.findFirst({ where: { id: studentId, orgId: s.ws.org.id, campusId: { in: s.campusIds } } });
    if (!st) return { ok: false, error: "empty.notFound" };
    if (stopId) {
      const stop = await db.busStop.findFirst({ where: { id: stopId, orgId: s.ws.org.id }, include: { route: { include: { stops: { include: { _count: { select: { students: { where: { status: "active" } } } } } } } } } });
      if (!stop) return { ok: false, error: "empty.notFound" };
      const riders = stop.route.stops.reduce((x, y) => x + y._count.students, 0);
      if (riders >= stop.route.capacity && st.busStopId && !stop.route.stops.some((x) => x.id === st.busStopId)) return { ok: false, error: "transport.full" };
      if (riders >= stop.route.capacity && !st.busStopId) return { ok: false, error: "transport.full" };
    }
    await db.student.update({ where: { id: studentId }, data: { busStopId: stopId } });
    await log(s, "route.rider", "student", studentId, stopId ? `put ${st.name} on a bus` : `took ${st.name} off the bus`, stopId ? `إضافة ${st.nameAr ?? st.name} إلى حافلة` : `إزالة ${st.nameAr ?? st.name} من الحافلة`);
    await indexStudent(db, studentId);
    refresh();
    return { ok: true };
  });
}

export async function findRiders(slug: string, campusId: string, q: string) {
  const s = await sch(slug, "transport.manage", "school.manage", "library.manage");
  const term = q.trim();
  if (term.length < 2) return [];
  const rows = await db.student.findMany({
    where: { orgId: s.ws.org.id, status: "active", campusId: campusId && s.campusIds.includes(campusId) ? campusId : { in: s.campusIds }, OR: [{ name: { contains: term } }, { nameAr: { contains: term } }, { number: { contains: term.toUpperCase() } }] },
    include: { grade: true, section: true, busStop: { include: { route: true } } },
    take: 12,
  });
  return rows.map((r) => ({ id: r.id, name: r.name, nameAr: r.nameAr, className: r.section ? `${r.grade.level <= 0 ? r.grade.name : r.grade.level}-${r.section.name}` : r.grade.name, bus: r.busStop?.route.code ?? null }));
}

// ───────────────────────── Library ─────────────────────────

const bookInput = z.object({
  campusId: z.string().default(""),
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().max(120).default(""),
  isbn: z.string().trim().max(20).default(""),
  language: z.enum(["en", "ar", "fr", "other"]),
  category: z.string().trim().max(60).default(""),
  shelf: z.string().trim().max(20).default(""),
  copies: z.number().int().min(1).max(500),
});
export type BookInput = z.input<typeof bookInput>;

export async function saveBook(slug: string, id: string | null, raw: BookInput): Promise<ActionResult<{ id: string }>> {
  return attempt(async () => {
    const s = await sch(slug, "library.manage", "school.manage");
    const parsed = bookInput.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "errors.required", field: String(parsed.error.issues[0]?.path[0] ?? "") };
    const d = parsed.data;
    const data = { campusId: d.campusId && s.campusIds.includes(d.campusId) ? d.campusId : (s.campus?.id ?? null), title: d.title, author: d.author || null, isbn: d.isbn || null, language: d.language, category: d.category || null, shelf: d.shelf || null, copies: d.copies };
    let bid = id;
    if (id) {
      const b = await db.book.findFirst({ where: { id, orgId: s.ws.org.id } });
      if (!b) return { ok: false, error: "empty.notFound" };
      const out = await db.loan.count({ where: { bookId: id, returnedOn: null } });
      if (d.copies < out) return { ok: false, error: "errors.required", field: "copies" };
      await db.book.update({ where: { id }, data });
    } else {
      const covers = ["#4B3FA8", "#0B6E8A", "#B5541C", "#1F7A4D", "#8A1538", "#2F7DB8", "#A86B00", "#C4467A"];
      bid = (await db.book.create({ data: { ...data, orgId: s.ws.org.id, coverColor: covers[d.title.length % covers.length] } })).id;
    }
    await indexBook(db, bid!);
    await log(s, id ? "book.updated" : "book.added", "book", bid!, `${id ? "updated" : "added"} “${d.title}”`, `${id ? "تعديل" : "إضافة"} «${d.title}»`);
    refresh();
    return { ok: true, id: bid! };
  });
}

export async function lendBook(slug: string, bookId: string, studentId: string, due: string): Promise<ActionResult> {
  return attempt(async () => {
    const s = await sch(slug, "library.manage", "school.manage");
    if (!ymd.safeParse(due).success) return { ok: false, error: "errors.required", field: "due" };
    const [book, st] = await Promise.all([
      db.book.findFirst({ where: { id: bookId, orgId: s.ws.org.id }, include: { _count: { select: { loans: { where: { returnedOn: null } } } } } }),
      db.student.findFirst({ where: { id: studentId, orgId: s.ws.org.id, status: "active" } }),
    ]);
    if (!book || !st) return { ok: false, error: "empty.notFound" };
    if (book._count.loans >= book.copies) return { ok: false, error: "library.none" };
    await db.loan.create({ data: { orgId: s.ws.org.id, bookId, studentId, borrowedOn: new Date(), dueOn: dohaNoon(due), issuedById: s.ws.viewer.id } });
    await log(s, "book.lent", "book", bookId, `lent “${book.title}” to ${st.name}`, `إعارة «${book.title}» إلى ${st.nameAr ?? st.name}`);
    refresh();
    return { ok: true };
  });
}

export async function returnLoan(slug: string, loanId: string): Promise<ActionResult> {
  return attempt(async () => {
    const s = await sch(slug, "library.manage", "school.manage");
    const loan = await db.loan.findFirst({ where: { id: loanId, orgId: s.ws.org.id, returnedOn: null }, include: { book: true } });
    if (!loan) return { ok: false, error: "empty.notFound" };
    await db.loan.update({ where: { id: loanId }, data: { returnedOn: new Date() } });
    refresh();
    return { ok: true };
  });
}

export async function remindLoan(slug: string, loanId: string): Promise<ActionResult> {
  return attempt(async () => {
    const s = await sch(slug, "library.manage", "school.manage");
    const loan = await db.loan.findFirst({ where: { id: loanId, orgId: s.ws.org.id, returnedOn: null }, include: { book: true, student: true } });
    if (!loan?.student) return { ok: false, error: "empty.notFound" };
    const parents = await db.studentGuardian.findMany({ where: { studentId: loan.student.id, guardian: { userId: { not: null } } }, include: { guardian: true } });
    const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Qatar" }).format(loan.borrowedOn);
    await notify(db, { orgId: s.ws.org.id, userIds: parents.map((p) => p.guardian.userId!), kind: "library.overdue", title: `Library book overdue: ${loan.book.title}`, titleAr: `كتاب مكتبة متأخر: ${loan.book.title}`, body: `${loan.student.name.split(" ")[0]} borrowed it on ${date}. Please return it to the library.`, bodyAr: `استعاره ${(loan.student.nameAr ?? loan.student.name).split(" ")[0]} في ${date}. يرجى إعادته إلى المكتبة.`, href: "children" });
    await db.loan.update({ where: { id: loanId }, data: { remindedAt: new Date() } });
    refresh();
    return { ok: true };
  });
}

// ───────────────────────── Announcements ─────────────────────────

const announcementInput = z.object({
  audience: z.enum(["everyone", "staff", "parents"]),
  campusId: z.string().default(""),
  gradeId: z.string().default(""),
  title: z.string().trim().min(2).max(140),
  titleAr: z.string().trim().max(140).default(""),
  body: z.string().trim().min(2).max(4000),
  bodyAr: z.string().trim().max(4000).default(""),
  pinned: z.boolean().default(false),
});
export type AnnouncementInput = z.input<typeof announcementInput>;

export async function publishAnnouncement(slug: string, raw: AnnouncementInput): Promise<ActionResult<{ count: number }>> {
  return attempt(async () => {
    const s = await sch(slug, "school.manage");
    const parsed = announcementInput.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "errors.required", field: String(parsed.error.issues[0]?.path[0] ?? "") };
    const d = parsed.data;
    const campusId = d.campusId && s.campusIds.includes(d.campusId) ? d.campusId : s.locked ? s.campusIds[0] : null;
    const a = await db.announcement.create({ data: { orgId: s.ws.org.id, audience: d.audience, campusId, gradeId: d.audience === "parents" && d.gradeId ? d.gradeId : null, title: d.title, titleAr: d.titleAr || null, body: d.body, bodyAr: d.bodyAr || null, pinned: d.pinned, authorId: s.ws.viewer.id } });
    // Who to tell: staff by membership; parents through their children (campus and grade).
    const recipients = new Set<string>();
    if (d.audience !== "parents") {
      const staff = await db.membership.findMany({ where: { orgId: s.ws.org.id, status: "active", role: { notIn: ["parent"] }, ...(campusId ? { OR: [{ campusId }, { campusId: null }] } : {}) }, select: { userId: true } });
      staff.forEach((m) => recipients.add(m.userId));
    }
    if (d.audience !== "staff") {
      const parents = await db.guardian.findMany({ where: { orgId: s.ws.org.id, userId: { not: null }, children: { some: { student: { status: "active", ...(campusId ? { campusId } : {}), ...(a.gradeId ? { gradeId: a.gradeId } : {}) } } } }, select: { userId: true } });
      parents.forEach((g) => recipients.add(g.userId!));
    }
    recipients.delete(s.ws.viewer.id);
    await notify(db, { orgId: s.ws.org.id, userIds: [...recipients], kind: "school.announcement", title: d.title, titleAr: d.titleAr || d.title, body: d.body.slice(0, 140), bodyAr: (d.bodyAr || d.body).slice(0, 140), href: "announcements" });
    await log(s, "announcement.published", "announcement", a.id, `published “${d.title}”`, `نشر «${d.titleAr || d.title}»`);
    refresh();
    return { ok: true, count: recipients.size };
  });
}

export async function deleteAnnouncement(slug: string, id: string): Promise<ActionResult> {
  return attempt(async () => {
    const s = await sch(slug, "school.manage");
    const res = await db.announcement.deleteMany({ where: { id, orgId: s.ws.org.id } });
    if (!res.count) return { ok: false, error: "empty.notFound" };
    refresh();
    return { ok: true };
  });
}
