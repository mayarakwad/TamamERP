"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { getWorkspace } from "@/lib/auth/dal";
import { audit } from "@/lib/audit";
import { bizSettings } from "@/lib/biz";
import { isValidIban, formatIban } from "@/lib/payroll/banks";
import { schoolSettings } from "@/lib/school/settings";
import { saveOnboarding, STEPS, type StepId } from "@/lib/onboarding";
import type { ActionResult } from "./claims";

// The workspace setup guide's actions. Owners and admins only.

async function manager(slug: string) {
  const ws = await getWorkspace(slug);
  if (!ws.can("workspace.manage")) throw new Error("not allowed");
  return ws;
}

function settingsOf(org: { settings: unknown }) {
  return (org.settings && typeof org.settings === "object" ? org.settings : {}) as Record<string, unknown>;
}

const isStep = (ws: Awaited<ReturnType<typeof manager>>, step: string): step is StepId => (STEPS[ws.orgType] as string[]).includes(step);

export async function startOnboarding(slug: string) {
  const ws = await manager(slug);
  await saveOnboarding(ws.org.id, (s) => (s.startedAt ? s : { ...s, startedAt: new Date().toISOString() }));
}

/** "Continue" on a step the data can't confirm by itself (e.g. the campuses look right). */
export async function confirmStep(slug: string, step: string): Promise<ActionResult> {
  const ws = await manager(slug);
  if (!isStep(ws, step)) return { ok: false, error: "errors.generic" };
  await saveOnboarding(ws.org.id, (s) => ({ ...s, confirmed: [...new Set([...(s.confirmed ?? []), step])], skipped: (s.skipped ?? []).filter((x) => x !== step) }));
  refresh();
  return { ok: true };
}

export async function skipStep(slug: string, step: string): Promise<ActionResult> {
  const ws = await manager(slug);
  if (!isStep(ws, step)) return { ok: false, error: "errors.generic" };
  await saveOnboarding(ws.org.id, (s) => ({ ...s, skipped: [...new Set([...(s.skipped ?? []), step])] }));
  refresh();
  return { ok: true };
}

export async function finishOnboarding(slug: string): Promise<ActionResult> {
  const ws = await manager(slug);
  await saveOnboarding(ws.org.id, (s) => ({ ...s, finishedAt: new Date().toISOString() }));
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "workspace.onboarded", entityType: "organization", entityId: ws.org.id, summary: "finished the setup guide", summaryAr: "أنهى دليل الإعداد" });
  refresh();
  return { ok: true };
}

/** Hide the "Finish setting up" card on the dashboard (the guide stays in Settings). */
export async function hideSetupCard(slug: string): Promise<ActionResult> {
  const ws = await manager(slug);
  await saveOnboarding(ws.org.id, (s) => ({ ...s, hiddenAt: new Date().toISOString() }));
  refresh();
  return { ok: true };
}

// ───────────────────────── Basics ─────────────────────────

const basicsInput = z.object({
  name: z.string().trim().min(2).max(120),
  nameAr: z.string().trim().max(120).default(""),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  address: z.string().trim().max(300).default(""),
  phone: z.string().trim().max(30).default(""),
  email: z.union([z.email(), z.literal("")]).default(""),
  crNumber: z.string().trim().max(40).default(""),
});

export async function saveBasics(slug: string, raw: z.input<typeof basicsInput>): Promise<ActionResult> {
  const ws = await manager(slug);
  const p = basicsInput.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.path[0] === "email" ? "errors.invalidEmail" : "errors.required", field: String(p.error.issues[0]?.path[0] ?? "") };
  const d = p.data;
  await db.organization.update({ where: { id: ws.org.id }, data: { name: d.name, nameAr: d.nameAr || null, brandColor: d.brandColor, address: d.address || null, phone: d.phone || null, email: d.email || null, crNumber: d.crNumber || null } });
  await saveOnboarding(ws.org.id, (s) => ({ ...s, confirmed: [...new Set([...(s.confirmed ?? []), "basics" as StepId])] }));
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "workspace.updated", entityType: "organization", entityId: ws.org.id, summary: "updated the workspace details from the setup guide", summaryAr: "تحديث بيانات مساحة العمل من دليل الإعداد", sensitive: true });
  refresh();
  return { ok: true };
}

// ───────────────────────── Branches / campuses ─────────────────────────

const campusInput = z.object({ name: z.string().trim().min(2).max(80), nameAr: z.string().trim().max(80).default("") });

/** Add a branch (business) or campus (school), or rename one. */
export async function saveCampus(slug: string, id: string | null, raw: z.input<typeof campusInput>): Promise<ActionResult<{ id: string }>> {
  const ws = await manager(slug);
  const p = campusInput.safeParse(raw);
  if (!p.success) return { ok: false, error: "errors.required", field: "name" };
  if (id) {
    const c = await db.campus.findFirst({ where: { id, orgId: ws.org.id } });
    if (!c) return { ok: false, error: "empty.notFound" };
    await db.campus.update({ where: { id }, data: { name: p.data.name, nameAr: p.data.nameAr || null } });
    await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "campus.updated", entityType: "organization", entityId: ws.org.id, summary: `renamed ${c.name} to ${p.data.name}`, summaryAr: `إعادة تسمية ${c.nameAr ?? c.name}` });
    refresh();
    return { ok: true, id };
  }
  if (ws.org.campuses.length >= 30) return { ok: false, error: "errors.generic" };
  const taken = new Set(ws.org.campuses.map((c) => c.code));
  const base = p.data.name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "C";
  let code = base;
  for (let i = 2; taken.has(code); i++) code = `${base}${i}`;
  const created = await db.campus.create({ data: { orgId: ws.org.id, name: p.data.name, nameAr: p.data.nameAr || null, code } });
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "campus.created", entityType: "organization", entityId: ws.org.id, summary: `added ${ws.orgType === "school" ? "the campus" : "the branch"} ${p.data.name}`, summaryAr: `إضافة ${p.data.nameAr || p.data.name}` });
  refresh();
  return { ok: true, id: created.id };
}

// ───────────────────────── Business: invoicing ─────────────────────────

const invoicingInput = z.object({
  bankName: z.string().trim().max(80).default(""),
  iban: z.string().trim().max(40).default(""),
  invoiceTerms: z.string().trim().max(600).default(""),
  invoiceNotes: z.string().trim().max(600).default(""),
  quoteTerms: z.string().trim().max(600).default(""),
});

/** Bank details and standard terms printed on invoices and quotations. */
export async function saveInvoicing(slug: string, raw: z.input<typeof invoicingInput>): Promise<ActionResult> {
  const ws = await manager(slug);
  if (ws.orgType !== "business") return { ok: false, error: "errors.generic" };
  const p = invoicingInput.safeParse(raw);
  if (!p.success) return { ok: false, error: "errors.generic" };
  const iban = p.data.iban.replace(/\s+/g, "").toUpperCase();
  if (iban && !isValidIban(iban)) return { ok: false, error: "hr.ibanInvalid", field: "iban" };
  const settings = settingsOf(ws.org);
  const sales = { ...(bizSettings(ws.org).sales ?? {}), bankName: p.data.bankName || undefined, iban: iban ? formatIban(iban) : undefined, invoiceTerms: p.data.invoiceTerms || undefined, invoiceNotes: p.data.invoiceNotes || undefined, quoteTerms: p.data.quoteTerms || undefined };
  await db.organization.update({ where: { id: ws.org.id }, data: { settings: JSON.parse(JSON.stringify({ ...settings, sales })) } });
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "workspace.invoicing", entityType: "organization", entityId: ws.org.id, summary: "updated the bank details and terms on invoices", summaryAr: "تحديث البيانات البنكية والشروط على الفواتير", sensitive: true });
  refresh();
  return { ok: true };
}

// ───────────────────────── School: admissions ─────────────────────────

export async function setAdmissionsOpen(slug: string, open: boolean): Promise<ActionResult> {
  const ws = await manager(slug);
  if (ws.orgType !== "school") return { ok: false, error: "errors.generic" };
  const settings = settingsOf(ws.org);
  await db.organization.update({ where: { id: ws.org.id }, data: { settings: JSON.parse(JSON.stringify({ ...settings, school: { ...schoolSettings(ws.org), admissionsOpen: open } })) } });
  await audit({ orgId: ws.org.id, userId: ws.viewer.id, action: "school.admissions", entityType: "organization", entityId: ws.org.id, summary: open ? "opened online applications" : "closed online applications", summaryAr: open ? "فتح التقديم الإلكتروني" : "إغلاق التقديم الإلكتروني" });
  refresh();
  return { ok: true };
}
