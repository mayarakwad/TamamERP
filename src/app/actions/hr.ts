"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getWorkspace, type Workspace } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { parseMoney } from "@/lib/money";
import { nextNumber } from "@/lib/series";
import { notify } from "@/lib/notify";
import { indexEmployee } from "@/lib/search/index-core";
import { bankFromIban, isValidIban, WPS_BANK_CODES } from "@/lib/payroll/banks";
import { applyLeaveToAttendance, clearLeaveFromAttendance, dohaNoon, LEAVE_TYPES, leaveBalance, minutesBetween, nextEmployeeNumber, parseWeekend, SHIFT, workingDays, ymdOf } from "@/lib/hr/ops";
import type { ActionResult } from "./claims";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

async function hrWs(slug: string) {
  const ws = await getWorkspace(slug);
  if (ws.orgType !== "business" && ws.orgType !== "school") return null;
  return ws;
}

const log = (ws: Workspace, action: string, entityType: string, entityId: string, summary: string, summaryAr: string, sensitive = false) =>
  audit({ orgId: ws.org.id, userId: ws.viewer.id, action, entityType, entityId, summary, summaryAr, sensitive });

/** Owners, admins and anyone granted leave approval. */
async function leaveApprovers(orgId: string) {
  const rows = await db.membership.findMany({ where: { orgId, status: "active" }, select: { userId: true, role: true, extraPermissions: true } });
  return rows.filter((r) => r.role === "owner" || r.role === "admin" || (r.extraPermissions ?? "").includes("leave.approve")).map((r) => r.userId);
}

// ───────────────────────── Employees ─────────────────────────

const employeeInput = z.object({
  name: z.string().trim().min(3).max(70),
  nameAr: z.string().trim().max(100).default(""),
  jobTitle: z.string().trim().max(100).default(""),
  jobTitleAr: z.string().trim().max(100).default(""),
  department: z.string().trim().max(60).default(""),
  campusId: z.string().nullable().default(null),
  nationality: z.string().max(2).default(""),
  phone: z.string().trim().max(40).default(""),
  email: z.union([z.email(), z.literal("")]).default(""),
  qid: z.string().trim().max(11).default(""),
  qidExpiry: ymd.or(z.literal("")).default(""),
  visaNumber: z.string().trim().max(12).default(""),
  passportNumber: z.string().trim().max(20).default(""),
  passportExpiry: ymd.or(z.literal("")).default(""),
  joinedOn: ymd,
  basicSalary: z.string().max(20),
  housingAllowance: z.string().max(20).default(""),
  transportAllowance: z.string().max(20).default(""),
  foodAllowance: z.string().max(20).default(""),
  otherAllowance: z.string().max(20).default(""),
  payMethod: z.enum(["bank", "cash"]),
  bankShortName: z.string().max(4).default(""),
  iban: z.string().max(40).default(""),
  annualLeaveDays: z.number().int().min(21).max(60),
  userId: z.string().nullable().default(null),
  notes: z.string().trim().max(1000).default(""),
});
export type EmployeeInput = z.input<typeof employeeInput>;

export async function saveEmployee(slug: string, id: string | null, raw: EmployeeInput): Promise<ActionResult<{ id: string }>> {
  const ws = await hrWs(slug);
  if (!ws || !ws.can("hr.manage")) return { ok: false, error: "empty.notAllowed" };
  const parsed = employeeInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "errors.required", field: String(parsed.error.issues[0]?.path[0] ?? "") };
  const d = parsed.data;
  if (d.name.split(/\s+/).length < 2) return { ok: false, error: "hr.nameTwoParts", field: "name" };
  if (d.qid && !/^\d{11}$/.test(d.qid)) return { ok: false, error: "hr.qidInvalid", field: "qid" };
  const money = (v: string) => (v ? parseMoney(v) : 0);
  const basic = money(d.basicSalary);
  if (!basic || basic <= 0) return { ok: false, error: "hr.basicRequired", field: "basicSalary" };
  const allowances = [d.housingAllowance, d.transportAllowance, d.foodAllowance, d.otherAllowance].map(money);
  if (allowances.some((a) => a === null || a < 0)) return { ok: false, error: "claims.amountInvalid", field: "housingAllowance" };
  const iban = d.iban.replace(/\s/g, "").toUpperCase();
  if (d.payMethod === "bank") {
    if (!isValidIban(iban)) return { ok: false, error: "hr.ibanInvalid", field: "iban" };
    if (d.bankShortName && !WPS_BANK_CODES.has(d.bankShortName)) return { ok: false, error: "hr.bankInvalid", field: "bankShortName" };
  }
  if (d.campusId && !ws.org.campuses.some((c) => c.id === d.campusId)) return { ok: false, error: "errors.generic" };
  if (d.userId && !(await db.membership.findFirst({ where: { orgId: ws.org.id, userId: d.userId } }))) return { ok: false, error: "errors.generic" };
  const data = {
    name: d.name,
    nameAr: d.nameAr || null,
    jobTitle: d.jobTitle || null,
    jobTitleAr: d.jobTitleAr || null,
    department: d.department || null,
    campusId: d.campusId,
    nationality: d.nationality || null,
    phone: d.phone || null,
    email: d.email || null,
    qid: d.qid || null,
    qidExpiry: d.qidExpiry ? dohaNoon(d.qidExpiry) : null,
    visaNumber: d.visaNumber || null,
    passportNumber: d.passportNumber || null,
    passportExpiry: d.passportExpiry ? dohaNoon(d.passportExpiry) : null,
    joinedOn: dohaNoon(d.joinedOn),
    basicSalary: basic,
    housingAllowance: allowances[0]!,
    transportAllowance: allowances[1]!,
    foodAllowance: allowances[2]!,
    otherAllowance: allowances[3]!,
    payMethod: d.payMethod,
    bankShortName: d.payMethod === "bank" ? d.bankShortName || bankFromIban(iban) : null,
    iban: d.payMethod === "bank" ? iban : null,
    annualLeaveDays: d.annualLeaveDays,
    userId: d.userId,
    notes: d.notes || null,
  };
  let empId = id;
  if (id) {
    const before = await db.employee.findFirst({ where: { id, orgId: ws.org.id } });
    if (!before) return { ok: false, error: "empty.notFound" };
    // A renewed document gets a fresh reminder.
    await db.employee.update({
      where: { id },
      data: { ...data, ...(before.qidExpiry?.getTime() !== data.qidExpiry?.getTime() ? { qidRemindedAt: null } : {}), ...(before.passportExpiry?.getTime() !== data.passportExpiry?.getTime() ? { passportRemindedAt: null } : {}) },
    });
    const payChanged = before.basicSalary !== basic || before.iban !== data.iban;
    await log(ws, "employee.updated", "employee", id, `updated ${d.name}${payChanged ? " (pay or bank details)" : ""}`, `تعديل بيانات ${d.nameAr || d.name}`, payChanged);
  } else {
    const number = await nextEmployeeNumber(db, ws.org.id);
    const e = await db.employee.create({ data: { ...data, orgId: ws.org.id, number } });
    empId = e.id;
    await log(ws, "employee.created", "employee", e.id, `added ${d.name} (${number})`, `إضافة الموظف ${d.nameAr || d.name}`);
  }
  await indexEmployee(db, empId!);
  refresh();
  return { ok: true, id: empId! };
}

export async function setEmployeeStatus(slug: string, id: string, status: "active" | "terminated", leftOn?: string): Promise<ActionResult> {
  const ws = await hrWs(slug);
  if (!ws || !ws.can("hr.manage")) return { ok: false, error: "empty.notAllowed" };
  const e = await db.employee.findFirst({ where: { id, orgId: ws.org.id } });
  if (!e) return { ok: false, error: "empty.notFound" };
  await db.employee.update({ where: { id }, data: { status, leftOn: status === "terminated" ? (leftOn ? dohaNoon(leftOn) : new Date()) : null } });
  await log(ws, status === "terminated" ? "employee.left" : "employee.rejoined", "employee", id, `${status === "terminated" ? "marked as left" : "reactivated"}: ${e.name}`, `${status === "terminated" ? "إنهاء خدمة" : "إعادة تفعيل"} ${e.nameAr ?? e.name}`, true);
  refresh();
  return { ok: true };
}

// ───────────────────────── Attendance ─────────────────────────

const attendanceInput = z.object({
  status: z.enum(["present", "late", "absent", "leave", "sick", "holiday", "clear"]),
  checkIn: time.or(z.literal("")).default(""),
  checkOut: time.or(z.literal("")).default(""),
  overtimeMin: z.number().int().min(0).max(24 * 60).default(0),
  note: z.string().trim().max(200).default(""),
});

export async function setAttendance(slug: string, employeeId: string, day: string, raw: z.input<typeof attendanceInput>): Promise<ActionResult> {
  const ws = await hrWs(slug);
  if (!ws || !ws.can("hr.manage")) return { ok: false, error: "empty.notAllowed" };
  const parsed = attendanceInput.safeParse(raw);
  if (!parsed.success || !ymd.safeParse(day).success) return { ok: false, error: "errors.generic" };
  const e = await db.employee.findFirst({ where: { id: employeeId, orgId: ws.org.id } });
  if (!e) return { ok: false, error: "empty.notFound" };
  const date = dohaNoon(day);
  const d = parsed.data;
  if (d.status === "clear") await db.attendanceDay.deleteMany({ where: { employeeId, date } });
  else {
    const data = { status: d.status, checkIn: d.checkIn || null, checkOut: d.checkOut || null, overtimeMin: d.overtimeMin, note: d.note || null };
    await db.attendanceDay.upsert({ where: { employeeId_date: { employeeId, date } }, create: { orgId: ws.org.id, employeeId, date, ...data }, update: data });
  }
  await log(ws, "attendance.updated", "employee", employeeId, `set ${day} to ${d.status} for ${e.name}`, `تعديل حضور ${e.nameAr ?? e.name} يوم ${day}`);
  refresh();
  return { ok: true };
}

/** Self-service clock: first tap checks in (late after the grace period), second checks out (overtime after 9 hours). */
export async function clock(slug: string): Promise<ActionResult<{ kind: "in" | "out"; at: string; late: boolean; overtime: number }>> {
  const ws = await hrWs(slug);
  if (!ws) return { ok: false, error: "empty.notAllowed" };
  const e = await db.employee.findFirst({ where: { orgId: ws.org.id, userId: ws.viewer.id, status: "active" } });
  if (!e) return { ok: false, error: "hr.noEmployeeRecord" };
  const now = new Date();
  const at = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Qatar", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  const date = dohaNoon(ymdOf(now));
  const today = await db.attendanceDay.findUnique({ where: { employeeId_date: { employeeId: e.id, date } } });
  if (!today || !today.checkIn) {
    const late = minutesBetween(SHIFT.start, at) > SHIFT.graceMin;
    await db.attendanceDay.upsert({
      where: { employeeId_date: { employeeId: e.id, date } },
      create: { orgId: ws.org.id, employeeId: e.id, date, status: late ? "late" : "present", checkIn: at },
      update: { status: late ? "late" : "present", checkIn: at },
    });
    refresh();
    return { ok: true, kind: "in", at, late, overtime: 0 };
  }
  if (today.checkOut) return { ok: false, error: "hr.alreadyOut" };
  const worked = minutesBetween(today.checkIn, at);
  const overtime = Math.max(0, worked - (SHIFT.hours + 1) * 60);
  await db.attendanceDay.update({ where: { id: today.id }, data: { checkOut: at, overtimeMin: Math.floor(overtime / 15) * 15 } });
  refresh();
  return { ok: true, kind: "out", at, late: false, overtime };
}

// ───────────────────────── Leave ─────────────────────────

const leaveInput = z.object({
  employeeId: z.string().nullable().default(null),
  type: z.enum(LEAVE_TYPES),
  start: ymd,
  end: ymd,
  reason: z.string().trim().max(500).default(""),
});
export type LeaveInput = z.input<typeof leaveInput>;

export async function requestLeave(slug: string, raw: LeaveInput): Promise<ActionResult<{ id: string; number: string; days: number }>> {
  const ws = await hrWs(slug);
  if (!ws) return { ok: false, error: "empty.notAllowed" };
  const parsed = leaveInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "errors.required", field: String(parsed.error.issues[0]?.path[0] ?? "") };
  const d = parsed.data;
  const emp = d.employeeId && ws.can("hr.manage") ? await db.employee.findFirst({ where: { id: d.employeeId, orgId: ws.org.id } }) : await db.employee.findFirst({ where: { orgId: ws.org.id, userId: ws.viewer.id, status: "active" } });
  if (!emp) return { ok: false, error: "hr.noEmployeeRecord" };
  const start = dohaNoon(d.start);
  const end = dohaNoon(d.end);
  if (end < start) return { ok: false, error: "hr.endBeforeStart", field: "end" };
  const days = workingDays(start, end, parseWeekend(ws.org.weekend)).length;
  if (days === 0) return { ok: false, error: "hr.noWorkingDays", field: "end" };
  const overlap = await db.leaveRequest.findFirst({ where: { employeeId: emp.id, status: { in: ["submitted", "approved"] }, startDate: { lte: end }, endDate: { gte: start } } });
  if (overlap) return { ok: false, error: "hr.overlaps", field: "start" };
  if (d.type === "annual") {
    const bal = await leaveBalance(db, emp, start);
    if (days > bal.remaining - bal.pending) return { ok: false, error: "hr.notEnoughLeave", field: "end" };
  }
  const req = await db.$transaction(async (tx) => {
    const number = await nextNumber(tx, ws.org.id, "LV", start);
    return tx.leaveRequest.create({ data: { orgId: ws.org.id, number, employeeId: emp.id, type: d.type, startDate: start, endDate: end, days, reason: d.reason || null, requestedById: ws.viewer.id } });
  });
  await log(ws, "leave.requested", "leave", req.id, `requested ${days} days of ${d.type} leave for ${emp.name} (${req.number})`, `طلب إجازة ${days} أيام لـ ${emp.nameAr ?? emp.name}`);
  await notify(db, {
    orgId: ws.org.id,
    userIds: await leaveApprovers(ws.org.id),
    except: ws.viewer.id,
    kind: "leave.requested",
    title: `${emp.name} asked for ${days} days of leave (${d.start} → ${d.end})`,
    titleAr: `طلب إجازة من ${emp.nameAr ?? emp.name}: ${days} أيام (${d.start} ← ${d.end})`,
    href: `hr/leave?status=submitted`,
  });
  refresh();
  return { ok: true, id: req.id, number: req.number, days };
}

export async function decideLeave(slug: string, id: string, decision: "approve" | "reject" | "cancel", note?: string): Promise<ActionResult> {
  const ws = await hrWs(slug);
  if (!ws) return { ok: false, error: "empty.notAllowed" };
  const req = await db.leaveRequest.findFirst({ where: { id, orgId: ws.org.id }, include: { employee: true } });
  if (!req) return { ok: false, error: "empty.notFound" };
  const own = req.employee.userId === ws.viewer.id;
  const approver = ws.can("leave.approve") || ws.can("hr.manage");
  if (decision === "cancel") {
    if (!(own && req.status === "submitted") && !(approver && ["submitted", "approved"].includes(req.status))) return { ok: false, error: "empty.notAllowed" };
  } else {
    if (!approver || req.status !== "submitted") return { ok: false, error: "empty.notAllowed" };
    if (own && ws.role !== "owner") return { ok: false, error: "hr.cantApproveOwn" };
    if (decision === "reject" && !note?.trim()) return { ok: false, error: "errors.required", field: "reason" };
  }
  const status = { approve: "approved", reject: "rejected", cancel: "cancelled" }[decision];
  await db.$transaction(async (tx) => {
    await tx.leaveRequest.update({ where: { id }, data: { status, ...(decision !== "cancel" ? { decidedById: ws.viewer.id, decidedAt: new Date(), decisionNote: note?.trim() || null } : {}) } });
    if (decision === "approve") await applyLeaveToAttendance(tx, req, parseWeekend(ws.org.weekend));
    if (decision === "cancel" && req.status === "approved") await clearLeaveFromAttendance(tx, req);
  });
  const words = { approve: ["approved", "اعتماد"], reject: ["declined", "رفض"], cancel: ["cancelled", "إلغاء"] }[decision];
  await log(ws, `leave.${status}`, "leave", id, `${words[0]} ${req.number} (${req.employee.name}, ${req.days} days)${note ? `: ${note}` : ""}`, `${words[1]} ${req.number}`);
  if (decision !== "cancel") {
    await notify(db, {
      orgId: ws.org.id,
      userIds: [req.requestedById, req.employee.userId ?? ""],
      except: ws.viewer.id,
      kind: `leave.${status}`,
      title: decision === "approve" ? `Your leave ${req.number} was approved. Enjoy!` : `Your leave ${req.number} was declined: ${note}`,
      titleAr: decision === "approve" ? `تم اعتماد إجازتك ${req.number}. إجازة سعيدة!` : `تم رفض إجازتك ${req.number}: ${note}`,
      href: "hr/leave",
    });
  }
  refresh();
  return { ok: true };
}
