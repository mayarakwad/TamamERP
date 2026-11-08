"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getWorkspace } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { parseMoney } from "@/lib/money";
import { notify } from "@/lib/notify";
import { isValidIban, WPS_BANK_CODES } from "@/lib/payroll/banks";
import { approveRun, generateRun, payRun, PayrollError, reopenRun, updatePayslip } from "@/lib/payroll/ops";
import { bizSettings } from "@/lib/biz";
import type { Prisma } from "@/generated/prisma/client";
import type { ActionResult } from "./claims";

const qar = (d: number) => `QAR ${(d / 100).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function payrollWs(slug: string) {
  const ws = await getWorkspace(slug);
  if ((ws.orgType !== "business" && ws.orgType !== "school") || !(ws.can("payroll.run") || ws.can("hr.manage"))) return null;
  return ws;
}

async function guard<R extends ActionResult<object>>(fn: () => Promise<R>): Promise<R | { ok: false; error: string }> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof PayrollError) return { ok: false, error: e.code };
    throw e;
  }
}

export async function runPayroll(slug: string, month: string): Promise<ActionResult<{ id: string }>> {
  return guard(async () => {
    const ws = await payrollWs(slug);
    if (!ws || !/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: "empty.notAllowed" };
    const run = await db.$transaction((tx) => generateRun(tx, ws.org.id, month, ws.viewer.id), { timeout: 60_000 });
    await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "payroll.generated", entityType: "payroll", entityId: run.id, summary: `prepared payroll for ${month}: ${qar(run.totalNet)} net`, summaryAr: `إعداد رواتب ${month}`, sensitive: true });
    refresh();
    return { ok: true, id: run.id };
  });
}

const slipInput = z.object({
  absentDays: z.number().int().min(0).max(31),
  unpaidLeaveDays: z.number().int().min(0).max(31),
  overtimeHours: z.string().max(10),
  bonus: z.string().max(20),
  advanceDeduction: z.string().max(20),
  otherDeduction: z.string().max(20),
  notes: z.string().trim().max(300),
});
export type SlipInput = z.input<typeof slipInput>;

export async function editPayslip(slug: string, slipId: string, raw: SlipInput): Promise<ActionResult> {
  return guard(async () => {
    const ws = await payrollWs(slug);
    if (!ws) return { ok: false, error: "empty.notAllowed" };
    const parsed = slipInput.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "errors.generic" };
    const d = parsed.data;
    const m = (v: string) => (v ? parseMoney(v) : 0);
    const amounts = [m(d.bonus), m(d.advanceDeduction), m(d.otherDeduction), m(d.overtimeHours)];
    if (amounts.some((a) => a === null || a < 0)) return { ok: false, error: "claims.amountInvalid" };
    if (amounts[2]! > 0 && !d.notes) return { ok: false, error: "payroll.noteRequired", field: "notes" };
    const run = await db.$transaction((tx) =>
      updatePayslip(tx, ws.org.id, slipId, { absentDays: d.absentDays, unpaidLeaveDays: d.unpaidLeaveDays, overtimeHours: amounts[3]!, bonus: amounts[0]!, advanceDeduction: amounts[1]!, otherDeduction: amounts[2]!, notes: d.notes || null }),
    );
    const slip = await db.payslip.findUniqueOrThrow({ where: { id: slipId }, include: { employee: true } });
    await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "payroll.payslipEdited", entityType: "payroll", entityId: run.id, summary: `adjusted ${slip.employee.name}'s payslip for ${run.month}: net ${qar(slip.net)}`, summaryAr: `تعديل قسيمة ${slip.employee.nameAr ?? slip.employee.name}`, sensitive: true });
    refresh();
    return { ok: true };
  });
}

export async function payrollAction(slug: string, runId: string, action: "approve" | "reopen" | "pay" | "refresh", payDate?: string): Promise<ActionResult> {
  return guard(async () => {
    const ws = await payrollWs(slug);
    if (!ws) return { ok: false, error: "empty.notAllowed" };
    const run = await db.payrollRun.findFirst({ where: { id: runId, orgId: ws.org.id } });
    if (!run) return { ok: false, error: "empty.notFound" };
    // Approving is a decision for owners, admins and HR managers; preparing and paying is for payroll staff too.
    if ((action === "approve" || action === "reopen") && !ws.can("hr.manage")) return { ok: false, error: "payroll.needsApprover" };
    await db.$transaction(
      async (tx) => {
        if (action === "refresh") await generateRun(tx, ws.org.id, run.month, ws.viewer.id);
        if (action === "approve") await approveRun(tx, ws.org.id, runId, ws.viewer.id);
        if (action === "reopen") await reopenRun(tx, ws.org.id, runId, ws.viewer.id);
        if (action === "pay") await payRun(tx, ws.org.id, runId, ws.viewer.id, payDate ? new Date(`${payDate}T12:00:00+03:00`) : new Date());
      },
      { timeout: 60_000 },
    );
    const after = await db.payrollRun.findUniqueOrThrow({ where: { id: runId } });
    const words = { approve: ["approved", "اعتماد"], reopen: ["reopened", "إعادة فتح"], pay: ["marked as paid", "تسجيل صرف"], refresh: ["recalculated", "إعادة احتساب"] }[action];
    await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: `payroll.${action}`, entityType: "payroll", entityId: runId, summary: `${words[0]} payroll ${run.month} (${qar(after.totalNet)} net)`, summaryAr: `${words[1]} رواتب ${run.month}`, sensitive: true });
    if (action === "pay") {
      const users = (await db.payslip.findMany({ where: { runId }, include: { employee: { select: { userId: true } } } })).map((p) => p.employee.userId).filter(Boolean) as string[];
      await notify(db, { orgId: ws.org.id, userIds: users, except: ws.viewer.id, kind: "payroll.paid", title: `Your payslip for ${run.month} is ready`, titleAr: `قسيمة راتبك لشهر ${run.month} جاهزة`, href: "hr/payslips" });
    }
    refresh();
    return { ok: true };
  });
}

const wpsInput = z.object({
  employerEid: z.string().regex(/^\d{7,8}$/),
  payerEid: z.string().regex(/^\d{7,8}$/).or(z.literal("")),
  bankShortName: z.string(),
  iban: z.string(),
});

export async function saveWpsSettings(slug: string, raw: z.input<typeof wpsInput>): Promise<ActionResult> {
  const ws = await getWorkspace(slug);
  if (!ws.can("workspace.manage") && !ws.can("payroll.run")) return { ok: false, error: "empty.notAllowed" };
  const parsed = wpsInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "payroll.eidInvalid", field: String(parsed.error.issues[0]?.path[0] ?? "") };
  const iban = parsed.data.iban.replace(/\s/g, "").toUpperCase();
  if (!isValidIban(iban)) return { ok: false, error: "hr.ibanInvalid", field: "iban" };
  if (!WPS_BANK_CODES.has(parsed.data.bankShortName)) return { ok: false, error: "hr.bankInvalid", field: "bankShortName" };
  const settings = bizSettings(ws.org);
  settings.payroll = { employerEid: parsed.data.employerEid, payerEid: parsed.data.payerEid || undefined, bankShortName: parsed.data.bankShortName, iban };
  await db.organization.update({ where: { id: ws.org.id }, data: { settings: settings as Prisma.InputJsonValue } });
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "payroll.wpsSettings", entityType: "organization", entityId: ws.org.id, summary: `updated WPS details (EID ${parsed.data.employerEid}, ${parsed.data.bankShortName})`, summaryAr: "تعديل بيانات نظام حماية الأجور", sensitive: true });
  refresh();
  return { ok: true };
}
