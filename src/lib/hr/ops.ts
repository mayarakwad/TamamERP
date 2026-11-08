// People rules shared by the HR screens, payroll and the demo seed.
// No server-only imports.

import type { Prisma, PrismaClient } from "../../generated/prisma/client";
import { leaveAccrued } from "../payroll/calc";

type Db = PrismaClient | Prisma.TransactionClient;

export const LEAVE_TYPES = ["annual", "sick", "unpaid", "emergency", "maternity", "hajj"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const ATTENDANCE_STATUSES = ["present", "late", "absent", "leave", "sick", "holiday"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

const DAY = 86400_000;

/** Noon in Doha on a "YYYY-MM-DD" day: stable in every time zone. */
export const dohaNoon = (ymd: string) => new Date(`${ymd}T12:00:00+03:00`);

export const ymdOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(d);

/** Weekday in Doha (0 = Sunday). */
export const dohaWeekday = (d: Date) => new Date(d.getTime() + 3 * 3600_000).getUTCDay();

export function parseWeekend(weekend: string | null | undefined): number[] {
  return (weekend ?? "5,6").split(",").map(Number).filter((n) => n >= 0 && n <= 6);
}

/** Every calendar day from start to end (inclusive), at noon Doha. */
export function daysBetween(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  for (let t = dohaNoon(ymdOf(start)).getTime(); t <= dohaNoon(ymdOf(end)).getTime(); t += DAY) out.push(new Date(t));
  return out;
}

/** Working days in a range, skipping the organization's weekend. */
export function workingDays(start: Date, end: Date, weekend: number[]): Date[] {
  return daysBetween(start, end).filter((d) => !weekend.includes(dohaWeekday(d)));
}

/** Next employee number: EMP-001, EMP-002 … */
export async function nextEmployeeNumber(db: Db, orgId: string) {
  const rows = await db.employee.findMany({ where: { orgId }, select: { number: true } });
  const max = rows.reduce((m, r) => Math.max(m, Number(r.number.replace(/\D/g, "")) || 0), 0);
  return `EMP-${String(max + 1).padStart(3, "0")}`;
}

export interface LeaveBalance {
  entitlement: number;
  accrued: number;
  carried: number;
  taken: number;
  pending: number;
  remaining: number;
}

/** Annual leave for the calendar year of `asOf`. */
export async function leaveBalance(db: Db, employee: { id: string; annualLeaveDays: number; joinedOn: Date; leaveOpening: number }, asOf = new Date()): Promise<LeaveBalance> {
  const year = new Date(asOf.getTime() + 3 * 3600_000).getUTCFullYear();
  const from = new Date(`${year}-01-01T00:00:00+03:00`);
  const to = new Date(`${year + 1}-01-01T00:00:00+03:00`);
  const reqs = await db.leaveRequest.findMany({ where: { employeeId: employee.id, type: "annual", status: { in: ["approved", "submitted"] }, startDate: { gte: from, lt: to } }, select: { days: true, status: true } });
  const taken = reqs.filter((r) => r.status === "approved").reduce((s, r) => s + r.days, 0);
  const pending = reqs.filter((r) => r.status === "submitted").reduce((s, r) => s + r.days, 0);
  const accrued = leaveAccrued(employee.annualLeaveDays, employee.joinedOn, asOf);
  return { entitlement: employee.annualLeaveDays, accrued, carried: employee.leaveOpening, taken, pending, remaining: accrued + employee.leaveOpening - taken };
}

/** Approved leave shows on the attendance sheet (weekends stay blank). */
export async function applyLeaveToAttendance(db: Db, leave: { orgId: string; employeeId: string; type: string; startDate: Date; endDate: Date }, weekend: number[]) {
  const status: AttendanceStatus = leave.type === "sick" ? "sick" : "leave";
  for (const d of workingDays(leave.startDate, leave.endDate, weekend)) {
    await db.attendanceDay.upsert({
      where: { employeeId_date: { employeeId: leave.employeeId, date: d } },
      create: { orgId: leave.orgId, employeeId: leave.employeeId, date: d, status, note: leave.type },
      update: { status, checkIn: null, checkOut: null, note: leave.type },
    });
  }
}

/** Remove leave marks when a request is cancelled after approval. */
export async function clearLeaveFromAttendance(db: Db, leave: { employeeId: string; startDate: Date; endDate: Date }) {
  await db.attendanceDay.deleteMany({ where: { employeeId: leave.employeeId, date: { gte: dohaNoon(ymdOf(leave.startDate)), lte: dohaNoon(ymdOf(leave.endDate)) }, status: { in: ["leave", "sick"] } } });
}

/** Days in a month that need someone at work (for "absent" when nobody checked in). */
export function monthDays(month: string): Date[] {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => dohaNoon(`${month}-${String(i + 1).padStart(2, "0")}`));
}

/** Minutes between "07:58" and "17:12". */
export function minutesBetween(a: string, b: string) {
  const [h1, m1] = a.split(":").map(Number);
  const [h2, m2] = b.split(":").map(Number);
  return h2 * 60 + m2 - (h1 * 60 + m1);
}

export const SHIFT = { start: "08:00", end: "17:00", graceMin: 10, hours: 8 };
